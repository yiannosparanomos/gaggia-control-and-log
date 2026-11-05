# Roadmap

Known bugs are in [`todo.md`](../todo.md). This page covers status and planned work.

## Status

| Piece | State |
|---|---|
| Firmware | Start and stop through the relay, auto-stop at 5–60 s, 60 s safety stop, journal and coffees on LittleFS. The current code compiles with PlatformIO but hasn't been uploaded yet, so it hasn't run on a real ESP32. The ESP32 still runs the earlier Arduino IDE build, which uses the old GET API |
| Web app | **timer.**, **journal.** (list and calendar) and **coffees.** tabs, a log form with six taste scales, and backup and restore |
| Relay and machine | COM and NO wired to PB1 and bench-tested clicking. A real shot through the machine still needs confirming |
| Scale | Worked in April 2026 with a stop at 40 g. Not in the current firmware |

## Planned work

Roughly in order.

1. **First upload with PlatformIO.** Download a backup first, run the checks in `todo.md`, and confirm
   a real shot through the machine.
2. **MCP server** on the PC, talking to the ESP32 API, so Claude can read the journal, analyse shots
   and suggest dial-in changes. It gets read and log tools only: **no tool that starts the pump**
   without a human at the machine. The design is still to be discussed. Follow-ups are in `todo.md`.
3. **Finish the API redesign.** POST for actions is done. Still to do: `PUT /api/settings`,
   `DELETE /api/brews/{id}`, ArduinoJson for parsing and validation, an OpenAPI spec as the source of
   truth, and SSE or WebSocket for the live timer instead of polling every 300 ms.
4. **Cloud sync** of brews and coffees. The backend isn't chosen. Options to discuss first: a small
   FastAPI service, Supabase or Google Sheets.
5. **Scale back in**, with stop by weight and a live extraction curve. See
   [hardware.md](hardware.md#the-scale-not-in-the-current-firmware) for what it needs.
6. **Sense the pump's state** through proper isolation, which fixes the top bugs in `todo.md`. See
   [development.md](development.md#the-esp32-cant-see-the-machine).
7. **Enclosures for the ESP32 and relay**, keeping low voltage physically apart from mains.

## Related project: the machine's enclosure

A concrete-look enclosure around the machine, in OSB and microcement, with the machine's buttons and
lights moved to separate toggle switches on the top or side, and water fed by a tube. It's outside this
repo, but driving the machine's buttons and LEDs from new controls would fit with this ESP32.
