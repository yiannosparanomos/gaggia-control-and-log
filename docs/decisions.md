# Decisions

Why things are the way they are. For the events behind them, see [history.md](history.md).

## Safety

| Decision | Why |
|---|---|
| The ESP32 connects to the machine only through the relay's dry contacts | The button board is not isolated from 230 V mains. Probing it while plugged in tripped the house RCD |
| Nothing starts the pump without a human action on the phone | No timers or automation may start a shot unattended. Future MCP tools can read and log, but can't start the pump |
| 60 s safety stop on every timed shot, separate from the auto-stop limit | A forgotten or mistimed shot still ends |
| Auto-stop runs on the ESP32, not in the app | It keeps working if the phone sleeps or loses WiFi |

## Hardware

| Decision | Why |
|---|---|
| Relay press is 500 ms, with at least 1 s between presses | Shorter timings caused missed presses and double clicks |
| Relay on GPIO19, GPIO18 kept as an input forever | The two pins are solder-bridged on this board |
| Load cell A+/A− swap corrected in code with a negative factor (−756.8) | Simpler than resoldering |
| 1 kg load cell rather than 5 kg | Much better resolution for a shot of about 40 g |

## Software

| Decision | Why |
|---|---|
| Time-based control first, scale postponed | Gets phone control working sooner. The old scale code is kept in [legacy/](legacy/) |
| PlatformIO in VS Code instead of the Arduino IDE | Better fit for developing with a repo and Claude Code |
| UI built into one HTML file, gzipped into the firmware | Storing it on LittleFS would need a filesystem upload, which wipes the journal |
| Fonts and everything else bundled locally | The page must work with no internet access |
| Stats, calendar and filtering run in the browser | The ESP32 has little memory to spare |
| WiFi credentials in a git-ignored `secrets.h` | They stay out of the repo |
| Shot rules live in `shot.h`, with no Arduino code | They control the pump, so they should be testable on a PC without hardware |
| Journal reads and deletes are refused during a shot | Sending them can block `loop()` for many seconds if the phone drops off WiFi, which would delay the stops |
| A failed WiFi update restarts the ESP32 | Otherwise a "start" tapped during the update could run when it ends, long after the tap |
| WiFi updates never start during a shot | An update blocks `loop()`, which would also block the auto-stop and safety stop |
| No password on WiFi updates, for now | Simple to use on a home network. Any device on the WiFi could replace the firmware, so this will be reconsidered (see `todo.md`) |
| A failed LittleFS mount never formats the flash | A failed mount may be recoverable, and a format would erase the journal |

## API

| Decision | Why |
|---|---|
| Everything under `/api` | Keeps the app and the API separate |
| Actions and settings are POST only | Link previews and browser prefetches can't press the relay |
| No authentication | The API trusts the home network. Any device on the WiFi, or a web page open on one, can still send a POST. Accepted for this project |

## Delivery

| Decision | Why |
|---|---|
| Flashing is always a command someone runs by hand | The ESP32 holds the journal and controls a pump |
| No self-hosted CI runners | On a public repo, code from a pull request could run on a PC inside the home network, where the API has no authentication |
| The live demo is a separate page in GitHub Pages | Visitors can try the app with no hardware, and it adds almost nothing to the firmware |
| The same `npm run check` runs locally and in CI | One set of tests, so nothing gets tested twice in different ways |

## AI tooling

| Decision | Why |
|---|---|
| `CLAUDE.md` is public and holds project rules only. Personal notes stay in git-ignored `CLAUDE.local.md` | The repo is public |
| Rules that matter are enforced by hooks, not just written down | Instructions can be ignored or forgotten |
| The docs check is a git hook with no AI, and a subagent runs only when it flags something | It catches your commits as well as Claude's, costs no tokens on most commits, and never needs to load every doc |
| No `/verify` skill | `npm run check` already does this, and Claude can run it |
| No Claude GitHub Action for now | Not needed yet for a project with one developer |

## Design

Light and monochrome with one signal red, dot-matrix numbers, English only, and lowercase labels
ending in a full stop. It's built for one-handed use on an Android phone. The UI went through a dark
version before settling on this.
