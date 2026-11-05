// =====================================================================
//  Gaggia Carezza Deluxe - ESP32 shot timer (no load cell yet)
//
//  - Start / stop the shot from your phone
//  - Live timer
//  - Optional auto-stop after a time limit (set from the phone)
//  - Safety: always stops after MAX_SHOT_S seconds
//  - Brew journal (dose, yield, ratio, taste scales, notes) saved in ESP32 flash
//  - Coffees: your bags, with "this week" picks shown first when logging
//  - Backup: /backup downloads everything as one JSON file
//
//  The journal survives normal uploads from Arduino IDE. It is only lost if you
//  turn on Tools > "Erase All Flash Before Sketch Upload" or change Tools > Partition Scheme.
//
//  Wiring: relay IN -> GPIO19, VCC -> VIN (5V), GND -> GND
//          relay COM + NO -> the two PB1 (coffee button) pads
//  GPIO18 stays disabled (solder bridge with GPIO19).
//
//  Open on the phone:  http://espresso.local   or the IP shown in Serial Monitor
//
//  The web page is built from web/ and embedded via web_assets.h (gzipped).
//  WiFi credentials live in secrets.h (not committed to git).
// =====================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <LittleFS.h>
#include "secrets.h"      // WIFI_SSID, WIFI_PASSWORD
#include "web_assets.h"   // INDEX_HTML_GZ, INDEX_HTML_GZ_LEN

// ============== CONFIGURATION ==============
const char* hostname = "espresso";           // -> http://espresso.local

#define RELAY_PIN 19                         // active LOW relay
const unsigned long PRESS_MS    = 500;       // how long the relay "presses" the button
const unsigned long COOLDOWN_MS = 1000;      // minimum time between two presses
const float         MAX_SHOT_S  = 60.0;      // safety stop, always on
const int           MIN_LIMIT_S = 5;
const int           MAX_LIMIT_S = 60;
// Keep false: a failed mount must never erase the journal. Set true for one upload only on a brand-new board.
const bool          FORMAT_IF_MOUNT_FAILS = false;

// ============== STATE ==============
bool storageOk = false;                      // did LittleFS mount? reported in /api/status
enum ShotState { IDLE, BREWING, DONE };
ShotState state = IDLE;
unsigned long startMs = 0, stopMs = 0, lastPressMs = 0;
bool everPressed = false;
unsigned long presses = 0;
String reason = "";

int  limitS   = 30;                          // saved in flash
bool autoStop = true;                        // saved in flash

const int HIST_N = 5;
float histT[HIST_N];
String histR[HIST_N];
int histCount = 0;

WebServer server(80);
Preferences prefs;

// ============== RELAY ==============
bool canPress() {
  return !everPressed || (millis() - lastPressMs >= COOLDOWN_MS);
}

void pressButton() {
  lastPressMs = millis();
  everPressed = true;
  presses++;
  digitalWrite(RELAY_PIN, LOW);
  delay(PRESS_MS);
  digitalWrite(RELAY_PIN, HIGH);
  Serial.println(">> Relay clicked");
}

// ============== SHOT LOGIC ==============
unsigned long elapsedMs() {
  if (state == BREWING) return millis() - startMs;
  if (state == DONE)    return stopMs - startMs;
  return 0;
}

void addHistory(float t, const String& r) {
  for (int i = HIST_N - 1; i > 0; i--) { histT[i] = histT[i - 1]; histR[i] = histR[i - 1]; }
  histT[0] = t; histR[0] = r;
  if (histCount < HIST_N) histCount++;
}

void startShot() {
  if (state == BREWING || !canPress()) return;
  startMs = millis();            // timer starts the moment the button is pressed
  pressButton();
  state = BREWING;
  reason = "";
  Serial.println(">> SHOT STARTED");
}

void stopShot(const String& why) {
  if (state != BREWING || !canPress()) return;   // if in cooldown, loop() retries
  stopMs = millis();
  pressButton();
  state = DONE;
  reason = why;
  float t = (stopMs - startMs) / 1000.0;
  addHistory(t, why);
  Serial.printf(">> SHOT STOPPED at %.1f s (%s)\n", t, why.c_str());
}

// ============== JSON ==============
String statusJson() {
  String s = "{\"state\":\"";
  s += (state == BREWING ? "brewing" : state == DONE ? "done" : "idle");
  s += "\",\"elapsed\":";  s += elapsedMs();
  s += ",\"limit\":";      s += limitS;
  s += ",\"auto\":";       s += (autoStop ? "true" : "false");
  s += ",\"reason\":\"";   s += reason;
  s += "\",\"presses\":";  s += presses;
  s += ",\"storage\":";    s += (storageOk ? "true" : "false");
  s += ",\"last\":[";
  for (int i = 0; i < histCount; i++) {
    if (i) s += ",";
    s += "{\"t\":"; s += String(histT[i], 1);
    s += ",\"r\":\""; s += histR[i]; s += "\"}";
  }
  s += "]}";
  return s;
}

void sendStatus() {
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", statusJson());
}

// ============== HANDLERS ==============
void handleRoot() {
  server.sendHeader("Content-Encoding", "gzip");
  server.send_P(200, "text/html; charset=utf-8", (const char*)INDEX_HTML_GZ, INDEX_HTML_GZ_LEN);
}
void handleStatus() { sendStatus(); }
void handleStart()  { startShot(); sendStatus(); }
void handleStop()   { stopShot("manual"); sendStatus(); }

// The relay only toggles the button, so a raw press during a timed shot would leave the ESP32 thinking
// the pump runs when it stopped, and its next "stop" press would START the pump. Use /api/stop instead.
void handlePress() {
  if (state != BREWING && canPress()) pressButton();
  sendStatus();
}

// Resets the screen only, never the machine (that's the point: it resyncs after a press on the machine).
// During a timed shot it also ends the auto and safety stops, so the caller must confirm the machine has stopped.
void handleReset() {
  if (state != BREWING || server.arg("confirm") == "1") { state = IDLE; reason = ""; }
  sendStatus();
}

void handleSet() {
  if (server.hasArg("limit")) {
    limitS = constrain(server.arg("limit").toInt(), MIN_LIMIT_S, MAX_LIMIT_S);
    prefs.putInt("limit", limitS);
  }
  if (server.hasArg("auto")) {
    autoStop = server.arg("auto") == "1";
    prefs.putBool("auto", autoStop);
  }
  sendStatus();
}

// ============== BREW JOURNAL (saved in ESP32 flash) ==============
// One brew per line as JSON in /brews.jsonl. The page sends {"id":...,...}.
// Coffees (your bags) are one small JSON array in /coffees.json.
// Both files live in the flash filesystem, which a normal sketch upload does NOT erase.
const char* BREWS_FILE   = "/brews.jsonl";
const char* COFFEES_FILE = "/coffees.json";

// Swaps a finished temp file over the real one. The real file is untouched until the temp file is
// proven complete, and LittleFS's rename replaces it in one step, so a power cut leaves old or new, never neither.
bool commitFile(const char* tmp, const char* path, size_t expectedSize) {
  File check = LittleFS.open(tmp, "r");
  bool ok = check && check.size() == expectedSize;
  if (check) check.close();
  if (ok) ok = LittleFS.rename(tmp, path);
  if (!ok) LittleFS.remove(tmp);
  return ok;
}

// Streams the brew lines as a JSON array without loading them all into memory
void streamBrews(bool withComma) {
  server.sendContent("[");
  File f = LittleFS.open(BREWS_FILE, "r");
  bool first = true;
  if (f) {
    while (f.available()) {
      String l = f.readStringUntil('\n');
      l.trim();
      if (!l.length()) continue;
      if (!first) server.sendContent(",");
      server.sendContent(l);
      first = false;
    }
    f.close();
  }
  server.sendContent(withComma ? "]," : "]");
}

String readCoffees() {
  File f = LittleFS.open(COFFEES_FILE, "r");
  if (!f) return "[]";
  String s = f.readString();
  f.close();
  s.trim();
  return s.startsWith("[") ? s : "[]";
}

void handleBrewsGet() {
  server.sendHeader("Cache-Control", "no-store");
  server.setContentLength(CONTENT_LENGTH_UNKNOWN);
  server.send(200, "application/json", "");
  streamBrews(false);
  server.sendContent("");   // end of response
}

void handleCoffeesGet() {
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", readCoffees());
}

void handleCoffeesPost() {
  String body = server.arg("plain");
  body.trim();
  if (!body.startsWith("[") || body.length() > 20000) { server.send(400, "text/plain", "bad coffees"); return; }
  const char* tmp = "/coffees.tmp";
  File f = LittleFS.open(tmp, "w");
  if (!f) { server.send(500, "text/plain", "storage error"); return; }
  f.print(body);
  f.close();
  if (!commitFile(tmp, COFFEES_FILE, body.length())) { server.send(500, "text/plain", "storage error"); return; }
  server.send(200, "application/json", "{\"ok\":true}");
}

// Whole journal + coffees as one downloadable file
void handleBackup() {
  server.sendHeader("Content-Disposition", "attachment; filename=\"gaggia-backup.json\"");
  server.sendHeader("Cache-Control", "no-store");
  server.setContentLength(CONTENT_LENGTH_UNKNOWN);
  server.send(200, "application/json", "");
  server.sendContent("{\"version\":1,\"brews\":");
  streamBrews(true);
  server.sendContent("\"coffees\":");
  server.sendContent(readCoffees());
  server.sendContent("}");
  server.sendContent("");
}

void handleBrewsPost() {
  String body = server.arg("plain");
  body.replace("\n", " ");
  body.replace("\r", " ");
  body.trim();
  if (body.length() < 10 || body.length() > 4000 || !body.startsWith("{\"id\":")) {
    server.send(400, "text/plain", "bad brew");
    return;
  }
  File f = LittleFS.open(BREWS_FILE, "a");
  if (!f) { server.send(500, "text/plain", "storage error"); return; }
  f.println(body);
  f.close();
  Serial.println(">> Brew saved");
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleBrewsDelete() {
  if (!server.hasArg("id")) { server.send(400, "text/plain", "missing id"); return; }
  String prefix = "{\"id\":" + server.arg("id") + ",";
  const char* tmp = "/brews.tmp";
  File in  = LittleFS.open(BREWS_FILE, "r");
  File out = LittleFS.open(tmp, "w");
  if (!in || !out) {
    if (in) in.close();
    if (out) out.close();
    server.send(500, "text/plain", "storage error");
    return;
  }
  size_t written = 0;
  bool complete = true;
  while (in.available()) {
    String l = in.readStringUntil('\n');
    l.trim();
    if (!l.length() || l.startsWith(prefix)) continue;
    size_t n = out.println(l);
    if (n != l.length() + 2) { complete = false; break; }   // flash full: +2 is the line ending
    written += n;
  }
  in.close(); out.close();
  if (!complete) LittleFS.remove(tmp);
  if (!complete || !commitFile(tmp, BREWS_FILE, written)) {
    server.send(500, "text/plain", "storage error");   // the journal itself was not touched
    return;
  }
  server.send(200, "application/json", "{\"ok\":true}");
}

// ============== SETUP ==============
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== Gaggia ESP32 shot timer ===");

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);   // relay off
  pinMode(18, INPUT);              // GPIO18 disabled (bridged to GPIO19)

  prefs.begin("espresso", false);
  limitS   = prefs.getInt("limit", 30);
  autoStop = prefs.getBool("auto", true);
  Serial.printf("Limit: %d s, auto-stop: %s\n", limitS, autoStop ? "ON" : "OFF");

  storageOk = LittleFS.begin(FORMAT_IF_MOUNT_FAILS);
  if (!storageOk) Serial.println("ERROR: flash storage (LittleFS) did not mount. Nothing was erased; journal unavailable");
  else Serial.println("Journal storage OK");

  WiFi.mode(WIFI_STA);
  WiFi.setHostname(hostname);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println();
  Serial.print("IP: http://"); Serial.println(WiFi.localIP());

  if (MDNS.begin(hostname)) {
    MDNS.addService("http", "tcp", 80);
    Serial.printf("Also: http://%s.local\n", hostname);
  }

  server.on("/", handleRoot);
  server.on("/api/status", HTTP_GET, handleStatus);
  // POST only (like @app.post in FastAPI), so a link preview or a browser prefetch can't press the relay
  server.on("/api/start", HTTP_POST, handleStart);
  server.on("/api/stop", HTTP_POST, handleStop);
  server.on("/api/set", HTTP_POST, handleSet);
  server.on("/api/press", HTTP_POST, handlePress);
  server.on("/api/reset", HTTP_POST, handleReset);
  server.on("/api/brews", HTTP_GET, handleBrewsGet);
  server.on("/api/brews", HTTP_POST, handleBrewsPost);
  server.on("/api/brews/delete", HTTP_POST, handleBrewsDelete);
  server.on("/api/coffees", HTTP_GET, handleCoffeesGet);
  server.on("/api/coffees", HTTP_POST, handleCoffeesPost);
  server.on("/api/backup", HTTP_GET, handleBackup);
  server.onNotFound([]() { server.send(404, "text/plain", "Not found"); });
  server.begin();
  Serial.println("Server ready!");
}

// ============== LOOP ==============
void loop() {
  server.handleClient();

  // Auto-stop runs on the ESP32 itself, so it works even if the phone sleeps or loses WiFi
  if (state == BREWING) {
    float e = elapsedMs() / 1000.0;
    if (autoStop && e >= limitS)  stopShot("limit");
    else if (e >= MAX_SHOT_S)     stopShot("safety");
  }

  // Reconnect if WiFi drops
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastTry = 0;
    if (millis() - lastTry > 5000) { lastTry = millis(); WiFi.reconnect(); }
  }
}
