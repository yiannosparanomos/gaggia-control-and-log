# Gaggia Control and Log

ESP32 add-on for a **Gaggia Carezza Deluxe** espresso machine. The ESP32 presses the machine's coffee
button through a relay, times the shot, auto-stops it, and serves a phone web app with a brew journal.

**Shared and personal stay separate.** This file is public and holds only project rules. Personal
preferences and notes go in `CLAUDE.local.md`, and journal copies go in `backups/`. Both are git-ignored
and must never be committed.

**Start here:** `docs/README.md` lists the docs. Read `docs/decisions.md` and `docs/development.md`
before any non-trivial task. Known bugs: `todo.md`. Planned work: `docs/roadmap.md`.

## Repo layout
- `firmware/` PlatformIO project, Arduino framework, board `esp32dev`. Entry point `src/main.cpp`.
  - `src/secrets.h` WiFi credentials (git-ignored). Template: `src/secrets.example.h`.
  - `src/web_assets.h` GENERATED from `web/` by `tools/embed.mjs`. Never edit by hand.
- `web/` Vite project, plain HTML/CSS/JS. `index.html`, `src/main.js`, `src/style.css`, `src/fonts.css`.
  Built into ONE self-contained `index.html` (vite-plugin-singlefile), then gzipped into the firmware.
- `firmware/src/shot.h` the shot rules, with no Arduino code. Tests: `firmware/test/`.
- `tools/embed.mjs` dist/index.html → gzip → C byte array. `tools/check.mjs` runs all checks. `tools/flash.mjs` backs up and uploads.
- `web/tests/` browser tests against a fake ESP32.
- `web/public/demo.html` the GitHub Pages demo. Not in the firmware.
- `.github/workflows/` CI and the demo deploy. No self-hosted runners, ever.
- `.claude/` the command guard hook and two subagents. `.githooks/` and `tools/check-docs.mjs` the docs check.
- `docs/` start at `docs/README.md`. Includes hardware, architecture, API, development notes, decisions, roadmap, history, images/, legacy/ (old scale code, not built).
- `todo.md` known bugs and cleanup.

## Commands
Run in `web/`. Details: `docs/development.md`.
- UI dev, simulated machine: `npm run dev`, open `http://localhost:5173/?sim`
- UI dev, real ESP32: `npm run dev` (proxies `/api/*` to the `ESP` env var)
- Build UI into firmware: `npm run build` (always after UI changes)
- **Verify a change: `npm run check` must pass.** Report the firmware size line.
- Optional phone layout test: `npm run test:ui`
- Upload: `npm run flash` (WiFi) or `npm run flash -- --usb`. Only the owner decides when to flash.

## Before committing
- Any change to firmware, `tools/flash.mjs` or the app's start, stop, press or reset controls: run the
  `safety-reviewer` subagent.
- If the commit-msg hook reports stale docs: run the `docs-keeper` subagent. Only add
  `Docs-Checked: <reason>` when no doc really needs changing. Never skip the hook.
- How this tooling fits together: `docs/architecture.md`, section 6.

## Hardware (do not change without asking)
- Relay module (active LOW): IN → **GPIO19**, VCC → VIN (5V), GND → GND. COM + NO → the two PB1 pads
  (coffee button) on the Gaggia button board (KBD). NC unused.
- **GPIO18 is solder-bridged to GPIO19.** Keep `pinMode(18, INPUT)` and never use GPIO18.
- HX711 load cell amp (not used by current code, may be wired): DT → GPIO4, SCK → GPIO5, VCC → 3.3V.
  Load cell calibration factor last measured: -756.8 (A+/A- swapped, corrected in code).
- Relay press = 500 ms LOW, minimum 1000 ms between presses. Safety stop at 60 s on every timed shot.
- Upload sometimes needs the BOOT button held during "Connecting...". The reset button is labelled RST.

## Safety rules
- The Gaggia button board (KBD) is NOT isolated from 230 V mains. Nothing from the ESP32 may connect
  to it except the relay's COM/NO contacts. Never suggest probing or soldering it while plugged in.
- Never add a way to start the pump without a human action on the phone (no timers/MCP tools that
  start shots unattended).

## Data on the ESP32 (do not lose it)
- LittleFS on a custom partition (`firmware/partitions.csv`, 896 KB):
  - `/brews.jsonl` and `/coffees.json`, plus settings in NVS. Formats: `docs/api.md`.
- **Never** run `pio run -t uploadfs`, `pio run -t erase`, or change the partition table: all wipe
  the journal. If a change truly needs it, tell the user to take a backup first (`npm run flash -- --dry-run`).
- Heavy computation (stats, calendar, filtering) happens in the browser, not on the ESP32.

## API
Routes and stored data: `docs/api.md`. No authentication, by decision: the API trusts the home network.
Change the API in firmware AND `web/src/main.js` (including the `?sim` simulator) AND `docs/api.md` together.

## UI conventions
- English only. Lowercase labels ending with a full stop ("start.", "log it.").
- Light, monochrome, one red (`--signal`), dot-matrix numbers (Doto), text in Commissioner.
- Everything bundled locally: no CDNs, no external fonts. Keep the gzipped page small
  (currently ~75 KB; each font weight ~18 KB).
- Must work one-handed on an Android phone (Redmi Note 14 Pro, Chrome).
