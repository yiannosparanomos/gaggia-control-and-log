# History

How the project got here. The reasons are collected in [decisions.md](decisions.md), and the repair is
written up with photos in [hardware.md](hardware.md#the-repair-onoff-button-stopped-working).

## April 2026: scale v1

- Bought an ESP32 DevKit, HX711, 1 kg load cell and 1-channel 5 V relay from Grobotronics.
- Uploads failed with "Wrong boot mode" until BOOT was held during "Connecting...".
- The ESP32 boot-looped when the HX711 wasn't connected, so `wait_ready_timeout(3000)` was added.
- The load cell read negative with weight on it because A+ and A− were physically swapped. This was
  corrected in code with a negative calibration factor.
- Readings drifted upward because of bad solder joints on the load cell wires, which were resoldered.
- Calibrated with a 71.4 g weight, giving a factor of −756.8.
- Found a solder bridge between GPIO18 and GPIO19, so the relay moved to GPIO19 and GPIO18 became a
  permanent input.
- The relay sometimes missed the second press or double-clicked, which led to the 500 ms press and 1 s
  cooldown.

## April to October 2026: the machine misbehaved

- The Gaggia started turning on and off by itself and ignoring its on/off button. At one point it only
  worked while a finger touched the board.
- Probing the button board with the machine plugged in **tripped the RCD**. That showed the board is
  mains-referenced, and the rule since then has been to unplug first.
- Screwing the board firmly to the chassis and adding ground wires seemed to help at times. This was
  misleading: the gold pads aren't even connected to the circuit's ground.

## 1 November 2026: the real fault

- Checked everything systematically, one thing at a time, with the machine unplugged.
- R8, marked 10 kΩ (code `103`), read **46.7 kΩ**. It sits in series between PB2 (on/off) and the ribbon.
- A parallel 10 kΩ gave about 8.2 kΩ and the button went completely dead. Lifting the new resistor's
  leg, and separately grounding both gold pads, didn't bring it back.
- Removing the old R8 and keeping only a 10 kΩ 1% through-hole resistor (9.9 kΩ) **fixed it**.
- An earlier misreading of R6 as `222` was corrected to `272` (2.7 kΩ). Lesson: read codes from
  close-up photos.

## 1–2 November 2026: timer firmware and web app

- Postponed the scale and started with time-based control from the phone.
- The UI moved from dark to a light, monochrome look with lowercase labels.
- Added the journal, calendar, coffees of the week and backup.
- Flashed from the Arduino IDE (ESP32 Arduino core 3.3.x) at 80% of the 1.25 MB app partition.

## 5 November 2026: moved to this repo

- Moved development to VS Code, Claude Code and PlatformIO, with the UI bundled into one gzipped file
  and WiFi credentials in a git-ignored `secrets.h`.
- First PlatformIO build succeeded on core 3.3.12 at 89.8% flash.
- A read-through found the bugs listed in [`todo.md`](../todo.md). Fixed so far: actions moved to POST,
  and protections added against losing coffees or journal data.
- The repo was made public, with no API authentication by decision.
