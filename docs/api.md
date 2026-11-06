# API

The ESP32 serves this over plain HTTP on the home network. There's no authentication, by decision: see
[decisions.md](decisions.md#api).

The route table is checked against the firmware. When you change the API, change the firmware,
`web/src/main.js` and its `?sim` simulator together.

## Routes

| Method | Path | What it does |
|---|---|---|
| GET | `/` | The app, as gzipped HTML |
| GET | `/api/status` | Current state: see below |
| POST | `/api/start` | Start a timed shot. Returns status |
| POST | `/api/stop` | Stop a timed shot. Returns status |
| POST | `/api/press` | Raw relay press, ignored during a timed shot. Returns status |
| POST | `/api/reset` | Resets the screen state only, without using the relay. During a timed shot it needs `?confirm=1`. Returns status |
| POST | `/api/set` | Settings, from `?limit=30` (5–60 s) and `?auto=1`. Returns status |
| GET | `/api/brews` | All brews, as an array. Returns 503 during a shot |
| POST | `/api/brews` | Add one brew. The body is JSON sent as `text/plain`. Returns 507 when under 8 KB of storage is free |
| POST | `/api/brews/delete` | Delete the brew given by `?id=`. Returns 503 during a shot |
| GET | `/api/coffees` | All coffees, as an array |
| POST | `/api/coffees` | Replace the whole coffees array |
| GET | `/api/backup` | Download `{version, brews, coffees}`. Returns 503 during a shot |

Firmware flashed before these `/api` routes existed uses `/status`, `/backup` and so on, with the same
backup format.

Long journal work is refused during a shot, because it could block the auto-stop and safety stop.

## Status

```json
{
  "state": "brewing",
  "elapsed": 12400,
  "limit": 30,
  "auto": true,
  "reason": "",
  "presses": 4,
  "storage": true,
  "last": [{ "t": 28.6, "r": "limit" }]
}
```

| Field | Meaning |
|---|---|
| `state` | `idle`, `brewing` or `done` |
| `elapsed` | Shot time in milliseconds |
| `limit`, `auto` | The auto-stop limit in seconds, and whether auto-stop is on |
| `reason`, `last[].r` | Why a shot stopped: `manual`, `limit` or `safety` |
| `presses` | Relay presses since boot |
| `storage` | `false` if the journal's flash storage didn't mount. Nothing is erased when this happens |
| `last` | The five most recent shots since boot, newest first, with `t` in seconds |

## Stored data

| Where | What |
|---|---|
| LittleFS `/brews.jsonl` | One brew per line. Each line must start with `{"id":`. New brews are appended, and a delete rewrites the file |
| LittleFS `/coffees.json` | The whole coffees array: `{id, name, roaster, roasted, week}` |
| NVS namespace `espresso` | Settings: `limit` (seconds) and `auto` |

A brew looks like this:

```json
{
  "id": 1793900000000,
  "ts": 1793900000000,
  "coffee": "Ethiopia Guji",
  "grind": "10",
  "dose": 18,
  "yield": 37,
  "time": 28.6,
  "s": { "acid": 4, "sweet": 4, "bitter": 1, "body": 3, "finish": 4, "overall": 5 },
  "notes": ["citrus", "floral"],
  "comment": "Best one this week."
}
```
