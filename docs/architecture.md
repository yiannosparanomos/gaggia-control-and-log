# Architecture

This page starts with the big picture and zooms in. Stop reading as soon as you know enough. The product
views follow the [C4 model](https://c4model.com): context, containers, then components. Later sections cover
how changes reach the machine, which C4 doesn't describe.

| Section | Answers |
|---|---|
| [1. Context](#1-context) | What is this, and what does it touch? |
| [2. Containers](#2-containers) | What are the main parts, and how do they talk? |
| [3. Components](#3-components) | What's inside each part? |
| [4. How a shot runs](#4-how-a-shot-runs) | What happens, step by step? |
| [5. Delivery](#5-delivery) | How does a change get tested and reach the machine? |
| [6. AI tooling](#6-ai-tooling) | How do Claude Code and its guards act on this repo? |

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
    press["<b>Relay driver</b><br/>clickRelay()"]
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

## 5. Delivery

Nothing reaches the machine automatically. GitHub has no route to your home network, and flashing is always a
command you choose to run on your own PC.

```mermaid
flowchart LR
  edit["<b>Edit</b>"] --> check["<b>npm run check</b><br/>the same checks as CI"]
  check --> commit["<b>Commit</b><br/>docs check runs here"]
  commit --> ci["<b>GitHub CI</b><br/>npm run check"]
  ci --> main["<b>main</b>"]
  main --> pages["<b>GitHub Pages</b><br/>simulated demo"]
  main --> flash["<b>npm run flash</b><br/>you run this, on your PC"]
  flash --> backup[("<b>Journal backup</b><br/>in backups/")]
  flash --> esp["<b>ESP32</b><br/>over WiFi or USB"]

  classDef step fill:#ffffff,stroke:#111111,color:#111111
  classDef cloud fill:#f3f3f0,stroke:#77776f,color:#111111
  classDef human fill:#d71921,stroke:#d71921,color:#ffffff
  classDef device fill:#111111,stroke:#111111,color:#ffffff
  class edit,check,commit,main step
  class ci,pages,backup cloud
  class flash human
  class esp device
```

| Workflow | Runs on | Does |
|---|---|---|
| [`ci.yml`](../.github/workflows/ci.yml) | Pull requests and `main` | Runs `npm run check`, then saves phone screenshots and `firmware.bin` |
| [`pages.yml`](../.github/workflows/pages.yml) | `main`, when `web/` changes | Publishes [`web/public/demo.html`](../web/public/demo.html) and the app in `?sim` mode |

CI runs on GitHub's own runners with read-only access. Never add a self-hosted runner: on a public repo, a
stranger's pull request could run code on that PC, inside your home network. See
[decisions.md](decisions.md#delivery).

## 6. AI tooling

This repo is developed with [Claude Code](https://code.claude.com/docs). None of this runs on the machine:
it only acts on the repo during development. Instructions alone can be ignored, so anything that really
matters is enforced by a check.

```mermaid
flowchart TB
  rules["<b>CLAUDE.md</b><br/>public project rules"]
  local["<b>CLAUDE.local.md</b><br/>personal, git-ignored"]
  claude["<b>Claude Code</b>"]
  guard{{"<b>guard.mjs hook</b><br/>before every command"}}
  agents["<b>Subagents</b><br/>safety-reviewer, docs-keeper"]
  repo["<b>Repo files</b>"]
  gitcheck{{"<b>commit-msg hook</b><br/>docs check, no AI"}}
  history[("<b>Git history</b>")]
  you(["<b>You</b>"])

  rules --> claude
  local --> claude
  claude -- "runs commands" --> guard
  guard -- "if allowed" --> repo
  claude -- "delegates reviews" --> agents
  agents -- "report, or fix docs" --> repo
  repo -- "git commit" --> gitcheck
  you -- "git commit" --> gitcheck
  gitcheck -- "if docs are current" --> history

  classDef code fill:#ffffff,stroke:#111111,color:#111111
  classDef private fill:#f3f3f0,stroke:#77776f,color:#111111
  classDef enforce fill:#d71921,stroke:#d71921,color:#ffffff
  classDef actor fill:#111111,stroke:#111111,color:#ffffff
  class rules,agents,repo code
  class local,history private
  class guard,gitcheck enforce
  class claude,you actor
```

| Piece | Where | What it does | Uses AI tokens? |
|---|---|---|---|
| Project rules | [`CLAUDE.md`](../CLAUDE.md) | Tells Claude the safety rules and commands. Advice, not enforcement | Loaded each session |
| Personal notes | `CLAUDE.local.md` | Your preferences. Never committed | Loaded each session |
| Command guard | [`.claude/hooks/guard.mjs`](../.claude/hooks/guard.mjs) | Blocks Claude from wiping the journal, staging private files or skipping git hooks. Doesn't cover commands you type | No |
| Docs check | [`tools/check-docs.mjs`](../tools/check-docs.mjs) | Compares the API table with the firmware, checks links, and blocks code changes that arrive without their docs. Covers your commits and Claude's | No |
| Docs map | [`tools/docs-map.json`](../tools/docs-map.json) | Lists which code affects which docs | No |
| Safety reviewer | [`.claude/agents/safety-reviewer.md`](../.claude/agents/safety-reviewer.md) | Read-only review of firmware changes against the pump, relay and journal rules | Yes, when used |
| Docs keeper | [`.claude/agents/docs-keeper.md`](../.claude/agents/docs-keeper.md) | Updates the docs when the docs check flags a change, reading only the diff and the mapped docs | Yes, when used |

The docs check can tell that a doc changed, but not that it's right. That's why the docs keeper exists.
