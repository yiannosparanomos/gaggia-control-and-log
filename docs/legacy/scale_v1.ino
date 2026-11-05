// LEGACY (April 2026) — first working version WITH the scale (HX711 + 1 kg load cell).
// Stopped the shot by WEIGHT (40 g) instead of time. Kept for reference when the scale
// is added back to firmware/src/main.cpp. Not built by PlatformIO (lives in docs/).
// Needs library: "HX711" by bogde.
// WiFi credentials removed: use secrets.h like the main firmware.

#include "HX711.h"
#include <WiFi.h>
#include <WebServer.h>

// ============== CONFIGURATION ==============
bool is_production = true;
bool stop_at_target = true;
float stop_weight = 40.0;

const char* ssid = "YOUR_WIFI";
const char* password = "YOUR_PASSWORD";

#define DT 4
#define SCK 5
#define RELAY_PIN 19

// Negative because the load cell's A+ and A- wires are physically swapped on the HX711.
// Measured with a 71.4 g reference weight. Formula when re-calibrating:
//   new_factor = old_factor * (displayed_weight / actual_weight)
float calibration_factor = -756.8;

HX711 scale;
WebServer server(80);
bool stop_sent = false;
bool brewing = false;
unsigned long last_click = 0;

String webpage = R"rawliteral(
<!DOCTYPE html><html><head><title>ESP32 Scale</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: sans-serif; text-align: center; background: #1a1a1a; color: #fff; padding-top: 50px; }
  #weight { font-size: 72px; font-weight: bold; margin: 30px 0; }
  #status { font-size: 28px; margin: 20px 0; padding: 15px; border-radius: 10px; }
  .stopped { background: #ff4444; } .running { background: #333; color: #aaa; } .brewing { background: #ff8800; }
  button { font-size: 20px; padding: 12px 30px; margin: 10px; border: none; border-radius: 8px; }
</style></head><body>
<h1>Espresso Scale</h1>
<div id="weight">-- g</div>
<div id="status" class="running">Ready</div>
<button onclick="fetch('/flip')">FLIP SWITCH</button>
<button onclick="fetch('/tare')">TARE</button>
<button onclick="fetch('/brew')">START BREW</button>
<button onclick="fetch('/reset')">RESET</button>
<script>
setInterval(() => {
  fetch("/data").then(r => r.json()).then(d => {
    document.getElementById("weight").innerHTML = d.weight + " g";
    const s = document.getElementById("status");
    if (d.stop_sent) { s.innerHTML = "STOP SENT - " + d.weight + "g reached"; s.className = "stopped"; }
    else if (d.brewing) { s.innerHTML = "BREWING... target: " + d.target + " g"; s.className = "brewing"; }
    else { s.innerHTML = "Ready - target: " + d.target + " g"; s.className = "running"; }
  });
}, 300);
</script></body></html>
)rawliteral";

// Relay: 500 ms press, 1 s minimum between presses (shorter caused missed/double clicks)
void pressButton() {
  unsigned long now = millis();
  if (now - last_click < 1000) return;
  last_click = now;
  digitalWrite(RELAY_PIN, LOW);
  delay(500);
  digitalWrite(RELAY_PIN, HIGH);
  delay(200);
}

void handleRoot()  { server.send(200, "text/html", webpage); }
void handleData()  {
  float w = scale.get_units(5);
  String json = "{\"weight\":\"" + String(w, 1) + "\",\"target\":\"" + String(stop_weight, 1) +
                "\",\"stop_sent\":" + (stop_sent ? "true" : "false") + ",\"brewing\":" + (brewing ? "true" : "false") + "}";
  server.send(200, "application/json", json);
}
void handleTare()  { scale.tare(); stop_sent = false; brewing = false; server.send(200, "text/plain", "OK"); }
void handleFlip()  { pressButton(); server.send(200, "text/plain", "OK"); }
void handleBrew()  {
  if (!brewing && !stop_sent) { scale.tare(); delay(500); pressButton(); brewing = true; }
  server.send(200, "text/plain", "OK");
}
void handleReset() { stop_sent = false; brewing = false; server.send(200, "text/plain", "OK"); }

void setup() {
  Serial.begin(115200);
  delay(2000);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);
  pinMode(18, INPUT);              // GPIO18 is solder-bridged to GPIO19

  Serial.println("Remove everything! Taring in 5 seconds...");
  delay(5000);
  scale.begin(DT, SCK);
  // Without this timeout the ESP32 boot-looped when the HX711 was missing
  if (scale.wait_ready_timeout(3000)) { scale.set_scale(calibration_factor); scale.tare(20); }
  else Serial.println("ERROR: HX711 not found!");

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.print("\nIP: "); Serial.println(WiFi.localIP());

  server.on("/", handleRoot); server.on("/data", handleData); server.on("/tare", handleTare);
  server.on("/flip", handleFlip); server.on("/brew", handleBrew); server.on("/reset", handleReset);
  server.begin();
}

void loop() {
  server.handleClient();
  if (stop_at_target && brewing && !stop_sent) {
    float w = scale.get_units(3);
    if (w >= stop_weight) { stop_sent = true; brewing = false; pressButton(); }
  }
}
