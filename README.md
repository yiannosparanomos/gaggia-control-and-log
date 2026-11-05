# Gaggia Control and Log

ESP32 add-on for a Gaggia Carezza Deluxe: start/stop shots from the phone, auto-stop on a time limit,
and keep a brew journal (dose, yield, ratio, taste, notes) with a calendar and "coffees of the week".

**Hardware:** wiring, the inside of the machine, and how a drifted 10 kΩ resistor broke the on/off
button → [docs/hardware.md](docs/hardware.md)

<img src="docs/images/r8-repair-10k.jpg" width="480" alt="Gaggia button board with the replacement 10k resistor">

```
firmware/   PlatformIO project (C++, Arduino framework) — runs on the ESP32
web/        The phone UI (HTML/CSS/JS, Vite) — built into one file and embedded in the firmware
tools/      embed.mjs: web/dist/index.html -> firmware/src/web_assets.h (gzip)
docs/       hardware, development notes, decisions, roadmap, history (start at docs/README.md)
todo.md     known bugs and cleanup
```

## Everyday commands

| What | Where | Command |
|---|---|---|
| Work on the UI with a fake machine | `web/` | `npm run dev` → open http://localhost:5173/?sim |
| Work on the UI against the real ESP32 | `web/` | `npm run dev` → open http://localhost:5173 |
| Build the UI into the firmware | `web/` | `npm run build` |
| Build firmware | `firmware/` | `pio run` |
| Upload to the ESP32 | `firmware/` | `pio run -t upload` |
| Serial monitor | `firmware/` | `pio device monitor` |

First time: copy `firmware/src/secrets.example.h` to `firmware/src/secrets.h` and fill in WiFi.
