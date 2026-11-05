// Runs on the PC with `pio test -e native`: no ESP32 needed.
#include <unity.h>
#include "../../src/shot.h"

void setUp() {}
void tearDown() {}

static Shot brewing(uint32_t at = 5000) {
  Shot s;
  s.tryStart(at);
  return s;
}

void test_start_clicks_once_and_starts_the_timer() {
  Shot s;
  TEST_ASSERT_TRUE(s.tryStart(5000));
  TEST_ASSERT_EQUAL(BREWING, s.state);
  TEST_ASSERT_EQUAL_UINT32(1, s.presses);
  TEST_ASSERT_EQUAL_UINT32(2500, s.elapsedMs(7500));
  TEST_ASSERT_FALSE(s.tryStart(9000));   // already brewing
  TEST_ASSERT_EQUAL_UINT32(1, s.presses);
}

void test_first_press_works_right_after_boot() {
  Shot s;
  TEST_ASSERT_TRUE(s.tryStart(0));
}

void test_stop_waits_for_the_cooldown_then_records_the_time() {
  Shot s = brewing(5000);
  TEST_ASSERT_FALSE(s.tryStop(5999));
  TEST_ASSERT_EQUAL(BREWING, s.state);
  TEST_ASSERT_TRUE(s.tryStop(6000));
  TEST_ASSERT_EQUAL(DONE, s.state);
  TEST_ASSERT_EQUAL_UINT32(1000, s.elapsedMs(99999));
}

void test_stop_does_nothing_when_not_brewing() {
  Shot s;
  TEST_ASSERT_FALSE(s.tryStop(5000));
  TEST_ASSERT_EQUAL_UINT32(0, s.presses);
}

void test_start_respects_the_cooldown_after_a_stop() {
  Shot s = brewing(5000);
  s.tryStop(30000);
  TEST_ASSERT_FALSE(s.tryStart(30999));
  TEST_ASSERT_TRUE(s.tryStart(31000));
}

void test_auto_stop_fires_at_the_limit() {
  Shot s = brewing(5000);
  s.limitS = 25;
  TEST_ASSERT_NULL(s.dueStop(29999));
  TEST_ASSERT_EQUAL_STRING("limit", s.dueStop(30000));
}

void test_safety_stop_fires_at_60_s_with_auto_stop_off() {
  Shot s = brewing(5000);
  s.autoStop = false;
  TEST_ASSERT_NULL(s.dueStop(64999));
  TEST_ASSERT_EQUAL_STRING("safety", s.dueStop(65000));
}

void test_nothing_is_due_when_not_brewing() {
  Shot s;
  TEST_ASSERT_NULL(s.dueStop(999999));
  s = brewing();
  s.tryStop(30000);
  TEST_ASSERT_NULL(s.dueStop(999999));
}

void test_stops_still_fire_when_millis_wraps_around() {
  uint32_t nearWrap = 0xFFFFF000;   // about 4 s before the 49.7 day wrap
  Shot s = brewing(nearWrap);
  s.limitS = 30;
  TEST_ASSERT_NULL(s.dueStop(nearWrap + 29999));
  TEST_ASSERT_EQUAL_STRING("limit", s.dueStop(nearWrap + 30000));
}

void test_raw_press_is_blocked_during_a_shot() {
  Shot s = brewing(5000);
  TEST_ASSERT_FALSE(s.tryPress(20000));
  TEST_ASSERT_EQUAL_UINT32(1, s.presses);
}

void test_raw_press_works_otherwise_but_respects_the_cooldown() {
  Shot s;
  TEST_ASSERT_TRUE(s.tryPress(5000));
  TEST_ASSERT_FALSE(s.tryPress(5500));
  TEST_ASSERT_EQUAL(IDLE, s.state);
}

void test_reset_during_a_shot_needs_confirmation() {
  Shot s = brewing(5000);
  TEST_ASSERT_FALSE(s.tryReset(false));
  TEST_ASSERT_EQUAL(BREWING, s.state);
  TEST_ASSERT_TRUE(s.tryReset(true));
  TEST_ASSERT_EQUAL(IDLE, s.state);
  TEST_ASSERT_EQUAL_UINT32(1, s.presses);   // never touches the relay
}

void test_reset_after_a_shot_needs_no_confirmation() {
  Shot s = brewing(5000);
  s.tryStop(30000);
  TEST_ASSERT_TRUE(s.tryReset(false));
  TEST_ASSERT_EQUAL(IDLE, s.state);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_start_clicks_once_and_starts_the_timer);
  RUN_TEST(test_first_press_works_right_after_boot);
  RUN_TEST(test_stop_waits_for_the_cooldown_then_records_the_time);
  RUN_TEST(test_stop_does_nothing_when_not_brewing);
  RUN_TEST(test_start_respects_the_cooldown_after_a_stop);
  RUN_TEST(test_auto_stop_fires_at_the_limit);
  RUN_TEST(test_safety_stop_fires_at_60_s_with_auto_stop_off);
  RUN_TEST(test_nothing_is_due_when_not_brewing);
  RUN_TEST(test_stops_still_fire_when_millis_wraps_around);
  RUN_TEST(test_raw_press_is_blocked_during_a_shot);
  RUN_TEST(test_raw_press_works_otherwise_but_respects_the_cooldown);
  RUN_TEST(test_reset_during_a_shot_needs_confirmation);
  RUN_TEST(test_reset_after_a_shot_needs_no_confirmation);
  return UNITY_END();
}
