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
- `tools/embed.mjs` dist/index.html → gzip → C byte array.
- `docs/` hardware, development notes, decisions, roadmap, history, images/, legacy/ (old scale code, not built).
- `todo.md` known bugs and cleanup.

## Commands
- UI dev, simulated machine: `cd web && npm run dev`, open `http://localhost:5173/?sim`
- UI dev, real ESP32: `cd web && npm run dev` (proxies `/api/*` to `ESP` env var, default `http://192.168.2.6`)
- Build UI into firmware: `cd web && npm run build` (always run before `pio run` after UI changes)
- Firmware: `cd firmware && pio run` / `pio run -t upload` / `pio device monitor` (115200 baud)
- Verify a change: `npm run build` must succeed, then `pio run` must compile with no errors.
  Report the flash usage line ("Flash: [====] xx%").

## Hardware (do not change without asking)
- Relay module (active LOW): IN → **GPIO19**, VCC → VIN (5V), GND → GND. COM + NO → the two PB1 pads
  (coffee button) on the Gaggia button board (KBD). NC unused.
- **GPIO18 is solder-bridged to GPIO19.** Keep `pinMode(18, INPUT)` and never use GPIO18.
- HX711 load cell amp (not used by current code, may be wired): DT → GPIO4, SCK → GPIO5, VCC → 3.3V.
  Load cell calibration factor last measured: -756.8 (A+/A- swapped, corrected in code).
- Relay press = 500 ms LOW, minimum 1000 ms between presses. Safety stop at 60 s always on.
- Upload sometimes needs the BOOT button held during "Connecting...". The reset button is labelled RST.

## Safety rules
- The Gaggia button board (KBD) is NOT isolated from 230 V mains. Nothing from the ESP32 may connect
  to it except the relay's COM/NO contacts. Never suggest probing or soldering it while plugged in.
- Never add a way to start the pump without a human action on the phone (no timers/MCP tools that
  start shots unattended).

## Data on the ESP32 (do not lose it)
- LittleFS on the default partition (`default.csv`, ~1.4 MB):
  - `/brews.jsonl` one brew per line, JSON, must start with `{"id":`. Append-only; delete rewrites the file.
  - `/coffees.json` whole array of coffees `{id,name,roaster,roasted,week}`.
- NVS (Preferences, namespace `espresso`): `limit` (s), `auto` (bool).
- **Never** run `pio run -t uploadfs`, `pio run -t erase`, or change the partition table: all wipe
  the journal. If a change truly needs it, tell the user to download a backup first (`/api/backup`).
- Heavy computation (stats, calendar, filtering) happens in the browser, not on the ESP32.

## Current API (all JSON)
| Method | Path | Notes |
|---|---|---|
| GET | `/` | the app (gzipped HTML from web_assets.h) |
| GET | `/api/status` | `{state: idle|brewing|done, elapsed ms, limit, auto, reason, presses, last:[{t,r}]}` |
| POST | `/api/start`, `/api/stop` | start or stop a timed shot; return status |
| POST | `/api/press` | raw relay press, ignored during a timed shot; return status |
| POST | `/api/reset` | screen state only, no relay. During a timed shot needs `?confirm=1`; return status |
| POST | `/api/set?limit=30&auto=1` | settings; return status |
| GET/POST | `/api/brews` | list (array) / append one brew (body = JSON, text/plain) |
| POST | `/api/brews/delete?id=` | delete one brew |
| GET/POST | `/api/coffees` | read / replace the whole coffees array |
| GET | `/api/backup` | download `{version, brews, coffees}` |

No authentication, by decision: the API trusts the home network. Known bugs: `todo.md`.

Planned: move to a cleaner REST design (PUT /api/settings, DELETE /api/brews/{id}),
ArduinoJson for parsing, SSE for the live timer, an OpenAPI spec, cloud sync, an MCP server on the PC.
Change the API in firmware AND `web/src/main.js` (including the `?sim` simulator) together.

## UI conventions
- English only. Lowercase labels ending with a full stop ("start.", "log it.").
- Light, monochrome, one red (`--signal`), dot-matrix numbers (Doto), text in Commissioner.
- Everything bundled locally: no CDNs, no external fonts. Keep the gzipped page small
  (currently ~75 KB; each font weight ~18 KB).
- Must work one-handed on an Android phone (Redmi Note 14 Pro, Chrome).
