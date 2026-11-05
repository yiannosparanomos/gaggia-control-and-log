# Architecture

This page starts with the big picture and zooms in. Stop reading as soon as you know enough. The product
views follow the [C4 model](https://c4model.com): context, containers, then components.

| Section | Answers |
|---|---|
| [1. Context](#1-context) | What is this, and what does it touch? |
| [2. Containers](#2-containers) | What are the main parts, and how do they talk? |
| [3. Components](#3-components) | What's inside each part? |
| [4. How a shot runs](#4-how-a-shot-runs) | What happens, step by step? |

## 1. Context

You use your phone. The add-on presses the machine's coffee button for you, exactly as a finger would. It
can't see what the machine is doing, and it works with no internet.

```mermaid
flowchart LR
  you(["<b>You</b><br/>at the machine"])
  addon["<b>Gaggia add-on</b><br/>ESP32, relay and phone app"]
  gaggia["<b>Gaggia Carezza Deluxe</b><br/>230 V espresso machine"]

  you -- "starts, stops and logs shots<br/>from the phone" --> addon
  addon -- "presses the coffee button<br/>through a relay" --> gaggia
  you -. "can also press the<br/>machine's own buttons" .-> gaggia

  classDef person fill:#111111,stroke:#111111,color:#ffffff
  classDef system fill:#d71921,stroke:#d71921,color:#ffffff
  classDef external fill:#f3f3f0,stroke:#77776f,color:#111111
  class you person
  class addon system
  class gaggia external
```

## 2. Containers

The ESP32 runs the firmware and also serves the app. The app runs in your phone's browser and asks the
firmware for its status about three times a second. All heavy work, such as stats and the calendar, happens
in the browser, because the ESP32 has little memory to spare.

```mermaid
flowchart TB
  app["<b>Web app</b><br/>runs in your phone's browser<br/>HTML, CSS and JS"]

  subgraph esp32["ESP32"]
    firmware["<b>Firmware</b><br/>C++, Arduino framework<br/>HTTP server and shot logic"]
    page[("<b>Embedded page</b><br/>gzipped, in program flash")]
    fs[("<b>LittleFS</b><br/>brews and coffees")]
    nvs[("<b>NVS</b><br/>settings")]
  end

  relay["<b>Relay module</b><br/>dry contacts only"]
  gaggia["<b>Gaggia button board</b><br/>not isolated from mains"]

  app -- "HTTP and JSON<br/>/api/*" --> firmware
  firmware -- "serves" --> page
  page -. "loads into" .-> app
  firmware -- "reads and writes" --> fs
  firmware -- "reads and writes" --> nvs
  firmware -- "GPIO19, 500 ms press" --> relay
  relay -- "closes PB1 contacts" --> gaggia

  classDef code fill:#ffffff,stroke:#111111,color:#111111
  classDef store fill:#f3f3f0,stroke:#77776f,color:#111111
  classDef mains fill:#d71921,stroke:#d71921,color:#ffffff
  style esp32 fill:#fafaf8,stroke:#77776f,color:#111111
  class app,firmware,relay code
  class page,fs,nvs store
  class gaggia mains
```

The app is embedded in the firmware rather than stored on LittleFS, because uploading a filesystem image
would wipe the journal. See [decisions.md](decisions.md#software).

## 3. Components

### Firmware

The code is in [`main.cpp`](../firmware/src/main.cpp) and [`shot.h`](../firmware/src/shot.h). For the exact
routes, see [api.md](api.md).

```mermaid
flowchart LR
  req(["HTTP request"])

  subgraph main["firmware/src/main.cpp"]
    routes["<b>Routes</b><br/>server.on(...)"]
    loopfn["<b>loop()</b><br/>auto-stop and safety stop"]
    press["<b>Relay driver</b><br/>pressButton()"]
    journal["<b>Journal storage</b><br/>append, replace, stream"]
    settings["<b>Settings</b><br/>Preferences"]
    ota["<b>WiFi updates</b><br/>ArduinoOTA, never during a shot"]
  end

  subgraph header["firmware/src/shot.h"]
    shot["<b>Shot rules</b><br/>state, cooldown, limits<br/>no Arduino code"]
  end

  gpio(["GPIO19"])
  files[("LittleFS")]
  prefs[("NVS")]

  req --> routes
  routes --> shot
  routes --> journal
  routes --> settings
  loopfn --> shot
  shot --> press
  press --> gpio
  journal --> files
  settings --> prefs
  loopfn --> ota

  classDef edge fill:#111111,stroke:#111111,color:#ffffff
  classDef code fill:#ffffff,stroke:#111111,color:#111111
  classDef safety fill:#d71921,stroke:#d71921,color:#ffffff
  classDef store fill:#f3f3f0,stroke:#77776f,color:#111111
  style main fill:#fafaf8,stroke:#77776f,color:#111111
  class req,gpio edge
  style header fill:#fafaf8,stroke:#77776f,color:#111111
  class routes,press,journal,settings,ota code
  class shot,loopfn safety
  class files,prefs store
```

- **Shot rules** decide when the relay may be pressed, including the 1 s cooldown and the time limits. They
  have no Arduino code, so they can be tested on a PC. `main.cpp` supplies the clock and clicks the relay.
- **`loop()`** checks the limits continuously on the ESP32, so a shot still stops if the phone sleeps.
- **WiFi updates** only run outside a shot, because an update blocks `loop()` and so would block the stops.
- **Journal storage** writes a replacement to a temp file first, checks its size, then swaps it in. A
  failure leaves the old file in place.

### Web app

[`web/src/main.js`](../web/src/main.js) is one file with the sections below.

```mermaid
flowchart LR
  subgraph ui["Views"]
    timer["<b>Timer</b>"]
    log["<b>Journal</b><br/>list and calendar"]
    beans["<b>Coffees</b>"]
    sheet["<b>Log form</b>"]
  end

  request["<b>request() and api()</b><br/>one way to reach the machine"]
  sim["<b>Simulator</b><br/>used with ?sim"]
  esp(["ESP32"])

  timer --> request
  log --> request
  beans --> request
  sheet --> request
  request -- "normally" --> esp
  request -- "with ?sim" --> sim

  classDef code fill:#ffffff,stroke:#111111,color:#111111
  classDef edge fill:#111111,stroke:#111111,color:#ffffff
  classDef fake fill:#f3f3f0,stroke:#77776f,color:#111111
  style ui fill:#fafaf8,stroke:#77776f,color:#111111
  class timer,log,beans,sheet,request code
  class esp edge
  class sim fake
```

With `?sim`, the same app runs with a JavaScript imitation of the firmware, so it needs no hardware. It
looks identical, but it can't show the real relay, flash storage or timing.

## 4. How a shot runs

```mermaid
sequenceDiagram
  autonumber
  actor You
  participant App as Web app
  participant FW as Firmware
  participant Relay
  participant Gaggia

  You->>App: tap start
  App->>FW: POST /api/start
  FW->>Relay: press for 500 ms
  Relay->>Gaggia: coffee button
  FW-->>App: status: brewing

  loop about 3 times a second
    App->>FW: GET /api/status
    FW-->>App: elapsed time
  end

  Note over FW: loop() checks the limits,<br/>even if the phone sleeps
  FW->>Relay: press at the limit
  Relay->>Gaggia: coffee button
  App->>FW: GET /api/status
  FW-->>App: status: done

  You->>App: log it, then save
  App->>FW: POST /api/brews
  FW-->>App: ok
```

The firmware's view of a shot:

```mermaid
stateDiagram-v2
  direction LR
  [*] --> idle
  idle --> brewing: start
  done --> brewing: start
  brewing --> done: stop, limit or 60 s safety
  done --> idle: reset
  brewing --> idle: reset with confirm=1
```

These states are what the firmware assumes, not what it measures, because nothing reports the machine's
real state. If someone uses the machine's own button, they can disagree. See
[development.md](development.md#the-esp32-cant-see-the-machine).
