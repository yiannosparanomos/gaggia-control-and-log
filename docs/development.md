# Development notes

The everyday commands are in the [README](../README.md). This page covers what they don't.

## Protect the journal

The journal lives on the ESP32's flash, and a normal `pio run -t upload` doesn't touch it.

- Never run `pio run -t uploadfs` or `pio run -t erase`, and don't change the partition table.
- Take a backup before any change that touches partitions or the storage format (`npm run flash -- --dry-run`).
- A new storage format needs a migration that reads the old files.

## Testing

`npm run check` in `web/` runs everything a change must pass, and CI runs the same command. None of it uses
AI tokens.

| Check | What it catches |
|---|---|
| No private files tracked | `secrets.h`, `CLAUDE.local.md` or journal backups in git |
| Build tool tests | Mistakes in the flash command's safety checks |
| Docs match the code | An API table that differs from the firmware, and broken links |
| UI builds, up to date, under 90 KB gzipped | A broken build, firmware shipping an old UI, a page that's too big |
| Browser tests | Buttons sending wrong requests, and data-loss bugs. A real browser clicks through the app against a fake ESP32, so this tests the app rather than the C++ routes |
| Shot logic tests | Wrong limits, cooldown, or safety stop. They run on the PC |
| Firmware compiles, under 97% of its partition | C++ errors, and firmware too big for its flash slot |

The shot logic tests need a C++ compiler for the PC, which Windows doesn't have by default. Without one,
`npm run check` skips them and CI still runs them. To add one:

```sh
pio pkg install -g -t platformio/toolchain-gccmingw32
```

The first run also needs a browser for the tests: `npx playwright install chromium`.

**Optional:** `npm run test:ui` checks phone-sized layouts, sideways scrolling and tap target sizes, and saves
screenshots to `web/test-results/ui/`. It isn't required for merging.

Nothing here runs the C++ routes or flash storage, so check those on the real ESP32 after a change to them.

## Keeping docs current

Each commit runs a check, set up automatically by `npm install` in `web/`. If you change code listed in
[`tools/docs-map.json`](../tools/docs-map.json) without changing one of its docs, the commit is blocked. Update
the doc, or if none needs changing, say why in the commit message:

```text
Docs-Checked: comment change only
```

Git hooks only run on your own PC, so CI repeats this check on pull requests. It can tell that a doc changed,
but not that it's right, so read the diff too. In Claude Code, the `docs-keeper` subagent can make the update.

## Building

- `platformio.ini` pins the platform version, which currently brings Arduino core **3.3.12**.
- Flash use is about 93% of the 1.25 MB app partition, and it can't grow without wiping the journal.
- The gzipped page is about 72 KB.
- npm may ask to approve esbuild's install script (`npm install-scripts approve esbuild`). It's Vite's
  normal build tool.
- PlatformIO often isn't on PATH when installed through VS Code. The npm scripts find it anyway. To run it
  yourself on Windows, use `~\.platformio\penv\Scripts\pio.exe`.

## Uploading

Run this in `web/`. It's the only command you normally need:

```sh
npm run flash            # over WiFi
npm run flash -- --usb   # over the USB cable
```

It does the following, and uploads nothing if an earlier step fails:

1. Checks the ESP32 is reachable and isn't brewing.
2. Saves the journal to `backups/`, which git ignores.
3. Builds the UI into the firmware, and compiles it.
4. Checks again that the ESP32 isn't brewing.
5. Uploads the firmware. This never touches the journal's storage.
6. Waits for the restart and confirms the journal has the same number of brews.

`npm run flash -- --dry-run` does only the first two steps, so it's also a quick way to take a backup.

**The first upload needs the cable**, because older firmware has no WiFi updates. WiFi uploads can't start
during a shot. If new firmware crashes before joining WiFi, you'll need the cable again.

If the ESP32 can't be reached at all, there's no backup to take, so the command stops. Only then, use
`pio run -t upload` directly in `firmware/`.

With the cable:

- Close the Arduino IDE and any other serial monitor first, or the COM port will be busy.
- If you get "Wrong boot mode" errors, hold **BOOT** during "Connecting...".
- "Hard resetting via RTS pin..." at the end is normal. It isn't stuck.
- The board's reset button is labelled **RST**.

## CI and the demo

GitHub Actions runs `npm run check` on every pull request and on `main`. A separate workflow publishes the
simulated demo to GitHub Pages. To turn the demo on, once: in the repo's **Settings > Pages**, set **Source** to
**GitHub Actions**. To require passing checks before merging, add a branch protection rule for `main`.

To preview the demo locally, run `npm run dev` and open `http://localhost:5173/demo.html`.

## Network

- The ESP32 is at `http://192.168.2.6` on the home WiFi, and that's the default target for `npm run dev`.
  To use another address, run `ESP=http://x.x.x.x npm run dev`.
- `http://espresso.local` also works, but mDNS is unreliable on Android.

## The ESP32 can't see the machine

The relay only toggles the coffee button, so the firmware assumes each press did what it expected. If
someone uses the machine's own button, the app gets out of sync. The **manual** section in the app is
there to resync it. See [`todo.md`](../todo.md) for the risks this causes.

Sensing the pump, for example from an LED signal on the button board or with a current sensor, would
fix this properly. It must only be done through proper isolation, because the button board is not
isolated from mains.

## Electrical safety

Unplug the machine before touching anything inside it. See the warning at the top of
[hardware.md](hardware.md).
