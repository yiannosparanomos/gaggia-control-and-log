# Development notes

The everyday commands are in the [README](../README.md). This page covers what they don't.

## Protect the journal

The journal lives on the ESP32's flash, and a normal `pio run -t upload` doesn't touch it.

- Never run `pio run -t uploadfs` or `pio run -t erase`, and don't change the partition table.
- Download a backup from `/api/backup` before any change that touches partitions or the storage format.
- A new storage format needs a migration that reads the old files.

## Building

- PlatformIO's `espressif32` platform currently installs Arduino core **3.3.12**. Earlier builds used
  the Arduino IDE with core 3.3.x, so the core line hasn't changed.
- The platform version isn't pinned yet, so an update can change the core without warning.
- Flash use is about 90% of the 1.25 MB app partition. The Arduino IDE build of the same code, with
  the page inline, was about 80%.
- The gzipped page is about 74 KB.
- npm may ask to approve esbuild's install script (`npm install-scripts approve esbuild`). It's Vite's
  normal build tool.

## Uploading

- Close the Arduino IDE and any other serial monitor first, or the COM port will be busy.
- If you get "Wrong boot mode" errors, hold **BOOT** during "Connecting...".
- "Hard resetting via RTS pin..." at the end is normal. It isn't stuck.
- The board's reset button is labelled **RST**.

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
