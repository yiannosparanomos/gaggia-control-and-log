# Todo

Bugs and cleanup found while reading the code on 5 Nov 2026. Planned work is in
[docs/roadmap.md](docs/roadmap.md).

## Open bugs

- [ ] **The pump can start with nobody there.** The relay only toggles the button and the ESP32 can't
      see the machine. If a timed shot ends some other way (the machine's own button, or a missed relay
      press), the state stays `brewing` and the "stop" press at the limit starts the pump, with no
      safety stop running. Blocking `/api/press` during a shot removed one cause, not the others.
      Needs sensing the pump's real state, only through proper isolation (see docs/development.md).
      Decide the method, then skip the stop press when the pump is already off.
- [ ] **A manual press can run the pump with no safety stop.** `/api/press` from idle may start the
      pump, and the 60 s stop only covers timed shots. Tracking the press as a shot isn't safe: if it
      actually stopped a shot started by hand, the later "stop" press would start the pump. The app
      now asks for a second tap and warns about this. Sensing the pump would close it properly.
- [ ] **One bad line hides the journal.** `/api/brews` only checks how a line starts, so invalid JSON
      breaks the whole response and the journal looks empty. Validate it with ArduinoJson (already
      planned for the API redesign), and make the reader skip bad lines.

## Fixed in code: check on the real machine

**Before the first upload, unplug the machine from mains and disconnect the relay's COM and NO wires.** A relay
click during a restart would start the pump, with no timed shot running to stop it.

The first upload needs the cable, and it also moves to the new partition table, which wipes the journal once.
Run these in `web/`, in this order:

1. Set `FORMAT_IF_MOUNT_FAILS = true` in `firmware/src/main.cpp`.
2. `npm run flash -- --usb`. It backs up the journal first and prints the backup's path, so note it. Check that it
   reports 11 or more brews. At the end it warns that the journal has 0 brews, which is expected this once. If it
   says the storage did not mount, step 1 was missed: do step 1, then run this again.
3. On the PC, open `http://192.168.2.6`, go to the log tab and use **restore from file** with the backup from step 2.
   Check that all the brews and coffees are back.
4. Set `FORMAT_IF_MOUNT_FAILS` back to `false`.
5. `npm run flash` over WiFi. It should say the journal still has all your brews.

Then:

- [ ] Listen for a relay click during each restart. If it clicks, don't reconnect until that's fixed.
- [ ] Only then reconnect the wires, with the machine still unplugged, and plug it back in.

- [ ] Step 5 above also proves that WiFi uploads work.
- [ ] Actions and settings are POST only. Start, stop, change the limit, and toggle auto stop from the phone.
- [ ] Opening `/api/start` in a browser returns 404 and the relay doesn't click.
- [ ] Reset during a shot needs a second tap, and `/api/press` does nothing during a shot.
- [ ] A failed coffee load no longer wipes the list. (Tested in a browser against a fake ESP32.)
- [ ] Delete a test brew and confirm the others remain. This is the first real test of the new
      replace-by-rename, also used when saving coffees. If it fails, the app reports an error and the
      old file stays in place.
- [ ] Opening the journal during a shot shows the old list, and it reloads when the shot ends.
- [ ] Tap start during a WiFi update you make fail, with the relay disconnected. The ESP32 should restart, and no
      shot should start.
- [ ] A failed LittleFS mount no longer formats the flash, and the app shows a warning instead.
      A brand-new board needs `FORMAT_IF_MOUNT_FAILS = true` for one upload.

## Cleanup

- [ ] Find out who owns the 1996 Carezza wiring diagram and whether it can be shared. It was removed from
      the repo (a local copy is git-ignored at `docs/images/carezza-1996-schematic.png`). If it's free to
      share, add it back to the end of `docs/hardware.md`.
- [ ] Replace the Commissioner and Doto fonts eventually, then update `THIRD_PARTY_NOTICES.md`.
- [ ] Consider a password for WiFi updates. There's none for now, so any device on the WiFi could replace the
      firmware, or overwrite the journal with a filesystem image.
- [ ] Move the auto-stop and safety stop into their own FreeRTOS task. Journal routes now wait until a shot is
      over, but reloading the page during a shot could still delay the stops if the phone drops off WiFi.
- [ ] **Deleting needs room for a second copy of the journal.** Once the journal is over about half of the
      896 KB storage (roughly 2,000 brews), deleting fails with an error, though nothing is lost. If storage then
      fills, new brews are refused too, and only a filesystem wipe after a backup frees it. Far off, but needs an
      answer before then, such as an in-place delete or moving old brews to Google storage.

## Next: AI features

- [ ] **MCP server on the PC, first after the repo is published.** Read and log tools only, with no tool
      that starts the pump. See [docs/roadmap.md](docs/roadmap.md).
- [ ] **Evals for the dial-in advice.** Replay past shots and measure whether the advice would have helped.
- [ ] **Advice that learns from one user's own shots.** Record each suggestion and the next shot's rating,
      so the journal shows what worked. No shared server. Note that Claude reading the journal still
      sends it to Anthropic; only a local model would keep it fully on the PC.
- [ ] **Optional: let people submit their logs to improve the advice.** Opt-in only. Decide consent,
      anonymising and moderation first. Different machines and grinders may make the data hard to compare.
- [ ] **Optional Playwright UI test** (`npm run test:ui`), not required for merging. Phone-sized screens,
      no sideways scrolling, buttons large enough to tap, and saved screenshots. Uses no AI tokens unless
      Claude is asked to review the screenshots.

## Decided

- **No authentication.** Moving to POST stops link previews and prefetches from pressing the relay. Any
  device on the WiFi, or a web page open on one, can still send a POST. Accepted for this project.
