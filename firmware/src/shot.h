// The shot rules, with no Arduino code in them: think of a pure function a FastAPI route calls.
// That lets `pio test -e native` run them on a PC. main.cpp supplies the clock and clicks the relay.
#pragma once
#include <stdint.h>

const uint32_t COOLDOWN_MS = 1000;     // minimum time between two presses
const uint32_t MAX_SHOT_MS = 60000;    // safety stop, on every timed shot

enum ShotState { IDLE, BREWING, DONE };

struct Shot {
  ShotState state = IDLE;
  uint32_t startMs = 0, stopMs = 0, lastPressMs = 0, presses = 0;
  bool everPressed = false;
  int limitS = 30;
  bool autoStop = true;

  bool canPress(uint32_t now) const {
    return !everPressed || now - lastPressMs >= COOLDOWN_MS;   // unsigned, so it survives millis() wrapping
  }

  uint32_t elapsedMs(uint32_t now) const {
    if (state == BREWING) return now - startMs;
    if (state == DONE) return stopMs - startMs;
    return 0;
  }

  // These three return true when the caller must click the relay.
  bool tryStart(uint32_t now) {
    if (state == BREWING || !canPress(now)) return false;
    startMs = now;
    recordPress(now);
    state = BREWING;
    return true;
  }

  bool tryStop(uint32_t now) {   // false during the cooldown: loop() retries
    if (state != BREWING || !canPress(now)) return false;
    stopMs = now;
    recordPress(now);
    state = DONE;
    return true;
  }

  // A raw press during a timed shot would leave the state saying "brewing" with the pump off,
  // and the next "stop" press would START the pump.
  bool tryPress(uint32_t now) {
    if (state == BREWING || !canPress(now)) return false;
    recordPress(now);
    return true;
  }

  // Changes the state only, never the machine. During a timed shot it also ends the auto and safety
  // stops, so the caller must confirm the machine has stopped.
  bool tryReset(bool confirmed) {
    if (state == BREWING && !confirmed) return false;
    state = IDLE;
    return true;
  }

  // Why this shot should stop now, or nullptr if it shouldn't.
  const char* dueStop(uint32_t now) const {
    if (state != BREWING) return nullptr;
    uint32_t elapsed = now - startMs;
    if (autoStop && elapsed >= (uint32_t)limitS * 1000) return "limit";
    if (elapsed >= MAX_SHOT_MS) return "safety";
    return nullptr;
  }

private:
  void recordPress(uint32_t now) {
    lastPressMs = now;
    everPressed = true;
    presses++;
  }
};
