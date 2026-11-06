# Legacy: the scale

The scale has been removed from the build. It stopped the shot at 40 g in April 2026, and this folder keeps what
we learned for when it comes back. None of it is built by PlatformIO. To revisit it, see
[`todo.md`](../../todo.md#future-hardware).

| File | What it is |
|---|---|
| [`scale_v1.ino`](scale_v1.ino) | The first working version, which stopped the shot by weight |
| [`calibrate_scale.ino`](calibrate_scale.ino) | The calibration sketch |

## Parts

| Part | Notes |
|---|---|
| HX711 load cell amplifier | |
| 1 kg bar load cell | 1 kg gives much better resolution than 5 kg for a shot of about 40 g |

## Wiring as it was

| From | To | Notes |
|---|---|---|
| HX711 VCC / GND | 3.3 V / GND | |
| HX711 DT / SCK | GPIO4 / GPIO5 | |
| Load cell red / black / white / green | E+ / E− / A− / A+ | A+ and A− were swapped, corrected with a negative calibration factor, which was simpler than resoldering |

## Calibration

The factor came out at **−756.8** with a 71.4 g reference weight. It's negative because A+ and A− were swapped.
To recalibrate: `new_factor = old_factor × displayed_weight / actual_weight`.

## Problems already solved

- The ESP32 boot-looped with the HX711 disconnected. Use `wait_ready_timeout(3000)`.
- Readings drifted upward because of bad solder joints on the load cell wires.

## Needed to bring it back

- Rigid mounting with M3 screws, not zip ties or hot glue.
- Some waterproofing for the load cell.
- A platform. A 2–3 mm aluminium sheet was being considered.
