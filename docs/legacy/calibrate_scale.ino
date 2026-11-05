// LEGACY — load cell calibration sketch used in April 2026.
// 1. Upload with nothing on the scale; it tares after 5 s.
// 2. Put a known weight on (we used 71.4 g) and read the "Raw" value in Serial Monitor (115200).
// 3. calibration_factor = raw / known_grams   (came out at about -756.8; negative because A+/A- are swapped)
// Needs library: "HX711" by bogde.

#include "HX711.h"
#define DT 4
#define SCK 5
HX711 scale;

void setup() {
  Serial.begin(115200);
  delay(2000);
  pinMode(18, INPUT);             // GPIO18 bridged to GPIO19
  pinMode(19, OUTPUT);
  digitalWrite(19, HIGH);         // keep relay off
  Serial.println("Remove everything from scale! Taring in 5 seconds...");
  delay(5000);
  scale.begin(DT, SCK);
  scale.set_scale();
  scale.tare(20);
  Serial.println("Tare done! Now place the known weight.");
}

void loop() {
  float raw = scale.get_units(20);
  Serial.print("Raw: ");
  Serial.println(raw, 1);
  delay(2000);
}
