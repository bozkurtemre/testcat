# Testcat iOS CLI reference

Simulators use `testcat-sim`. Physical iPhone/iPad devices use
`testcat-device`. All commands print JSON when there's structured data to return; one-shots
return `{"ok":true}` / `{"ok":false,"error":"…"}`. Errors go to stderr.

When testcat launches an agent, it may set `TESTCAT_SIM_BIN` and
`TESTCAT_DEVICE_BIN` to absolute binaries. Prefer these env vars in scripts.
Do not ask users to install upstream `agent-device`; Testcat ships its own
`testcat-device` runtime.

Do not treat planning text as execution. If the run says a simulator was
selected, an app was installed, or a screen was verified, there must be an
actual shell command invoking `${TESTCAT_SIM_BIN:-testcat-sim}` that did it.
Never ask the user for confirmation during a test run; proceed autonomously
until the scenario is verified or a real blocker is observed.
If the scenario asks for planning, subagents, or parallel simulator work, honor
that instruction when the current CLI/model exposes delegation. Keep the main
run responsible for the final testcat completion marker. If delegation is
unavailable, continue directly and say that subagent tooling was unavailable.
Do not call `update_plan`, and do not stop after writing a plan. The first
visible action should be `${TESTCAT_DEVICE_BIN:-testcat-device} list --json`
when physical devices are assigned, otherwise
`${TESTCAT_SIM_BIN:-testcat-sim} list --json`.

## Physical devices — `testcat-device`

```bash
testcat-device list --json
testcat-device prepare --udid <UDID>
testcat-device install --udid <UDID> --app /absolute/path/MyApp.ipa
testcat-device launch --udid <UDID> --app /absolute/path/MyApp.ipa
testcat-device describe-ui --udid <UDID>
testcat-device tap --udid <UDID> --x 120 --y 340
testcat-device fill --udid <UDID> --ref @e3 --text "user@example.com"
testcat-device type --udid <UDID> --text "hello"
testcat-device swipe --udid <UDID> --startX 200 --startY 700 --endX 200 --endY 250
testcat-device screenshot --udid <UDID> --out /tmp/physical.png
testcat-device complete --status passed --summary "Verified on physical device"
```

Physical devices do not use `boot` or `chrome layout`. Use `describe-ui` refs
when possible; coordinate `tap` is available as a fallback.

## Discovery — `list`

```bash
testcat-sim list                  # human table (Booted ●  iPhone 17 Pro Max  iOS 26.4  <UDID>)
testcat-sim list --json           # {"running":[…], "available":[…]}
```

Each device entry: `{ id, name, state, runtime, isBooted }`. Use `id`
(the UDID) for every other command. `state` is "Booted" or "Shutdown".

To pick the first running iPhone:

```bash
testcat-sim list --json \
  | jq -r '.running[] | select(.name | startswith("iPhone")) | .id' \
  | head -1
```

If `.running` is empty, choose the available iPhone with the newest iOS runtime
and newest device model, boot it, and confirm the new state before installing.
Do not install to a simulator whose latest listed state is `Shutdown`.

## Lifecycle — `boot` / `shutdown`

```bash
testcat-sim boot     --udid <UDID>
testcat-sim shutdown --udid <UDID>
```

Headless boot — the CoreSimulator framework spins the device up without
opening Simulator.app. `boot` is idempotent: an already-booted device
returns `{"ok":true}`.
Never use `launch` as a boot command. If `install` returns `Unable to lookup in
current state: Shutdown`, run `boot --udid <UDID>`, re-run `list --json`, and
retry install once before reporting a setup blocker.

Do not replace this with `open -a Simulator`, a direct launch of Xcode's
`Simulator.app`, or any fallback whose purpose is to make the native Simulator
window visible. If `testcat-sim` is unavailable, report that setup problem
instead of switching to visible Simulator.app tooling.

## App lifecycle — `install` / `launch` / `terminate` / `uninstall`

Use these for the build under test. They wrap `xcrun simctl` with a stable
testcat-facing interface and keep the workflow headless.

```bash
# Install a simulator-built .app bundle.
testcat-sim install --udid <UDID> --app /absolute/path/MyApp.app

# Launch by reading CFBundleIdentifier from the .app's Info.plist.
testcat-sim launch --udid <UDID> --app /absolute/path/MyApp.app --terminate-running-process

# Or launch/terminate/uninstall when the bundle id is already known.
testcat-sim launch    --udid <UDID> --bundle-id com.example.MyApp
testcat-sim terminate --udid <UDID> --bundle-id com.example.MyApp
testcat-sim uninstall --udid <UDID> --bundle-id com.example.MyApp
```

All four commands emit JSON. Example:

```json
{"app":"/absolute/path/MyApp.app","bundleId":"com.example.MyApp","ok":true,"stderr":null,"stdout":"com.example.MyApp: 12345","udid":"..."}
```

`install` expects a real `.app` directory built for the iOS Simulator. If
installation fails, report the exact `testcat-sim install` error; do not invent
or pass unsupported `simctl` flags.
`testcat-sim` reads `CFBundleIdentifier` from either `MyApp.app/Info.plist` or
`MyApp.app/Contents/Info.plist`, so a `Contents/Info.plist` layout is not by
itself a blocker.

## Test completion — `complete`

Every testcat run using this skill must finish with a completion marker after
the final UI interaction and verification:

```bash
testcat-sim complete --status passed --summary "Verified checkout success"
testcat-sim complete --status failed --summary "Payment failed with declined-card alert"
```

When the desktop app launches the agent, `complete` reads `TESTCAT_RUN_ID` and
`TESTCAT_RUN_COMPLETE_TOKEN` from the environment and prints a JSON marker:

```json
{"event":"testcat.run_complete","ok":true,"runId":"...","status":"passed","summary":"Verified checkout success","token":"..."}
```

Do not call `complete` as a planning step. It is the last simulator CLI call
after the app has been installed, launched, interacted with, and verified.
If setup is blocked after the available headless alternatives have been tried,
call `complete --status failed --summary "<observed blocker>"` before exiting
so testcat records a terminal failed result instead of an incomplete run.

## Screen geometry — `chrome layout`

```bash
testcat-sim chrome layout --udid <UDID>           # JSON
testcat-sim chrome layout --device-name "iPhone 17 Pro Max"
```

Returns:

```json
{
  "composite": {"width": 552, "height": 1115},
  "screen":    {"width": 438, "height": 954, "x": 57, "y": 81},
  "innerCornerRadius": 55,
  "buttons": [...]
}
```

The `screen.width` / `screen.height` are the values you pass as `width` /
`height` on every gesture. `composite` is the bezel image dimensions.

## One-shot gestures

Same wire format as `testcat-sim input`, one gesture per process. Use these
in shell scripts where you don't need streaming throughput.

```bash
testcat-sim tap        --udid X --x 219 --y 478 --width 438 --height 954 [--duration 0.05]
testcat-sim double-tap --udid X --x 219 --y 478 --width 438 --height 954 [--interval 0.05] [--duration 0.08]
testcat-sim swipe --udid X --startX 219 --startY 760 --endX 219 --endY 190 \
                       --width 438 --height 954 [--duration 0.3]
testcat-sim pinch --udid X --cx 219 --cy 478 --startSpread 60 --endSpread 240 \
                       --width 438 --height 954 [--duration 0.6]
testcat-sim pan   --udid X --x1 175 --y1 478 --x2 263 --y2 478 \
                       --dx 0 --dy 200 --width 438 --height 954 [--duration 0.5]
testcat-sim press --udid X --button home              # home | lock | power | volume-up | volume-down | action | app-switcher | swipe-to-app-switcher | swipe-to-home | pull-down-to-lock-screen | pull-down-to-notification-center
testcat-sim press --udid X --button action --duration 1.2   # long-press → "Hold for Ring"
testcat-sim press --udid X --button app-switcher                        # double home-press recipe → multitasking cards
testcat-sim press --udid X --button swipe-to-app-switcher               # slow drag-and-hold from the bottom edge → cards (gesture path)
testcat-sim press --udid X --button swipe-to-home                       # streamed home-indicator gesture
testcat-sim press --udid X --button pull-down-to-lock-screen            # slow drag from top-left → lock-screen cover sheet
testcat-sim press --udid X --button pull-down-to-notification-center    # slow drag from top-right → Notification Center
testcat-sim key   --udid X --code KeyA --modifiers shift,command [--duration 0.2]
testcat-sim type  --udid X --text "hello world"
testcat-sim paste --udid X --text "café ☕ user-1@example.com" [--no-press]
testcat-sim clipboard get|sync|copy --udid X
testcat-sim location set --udid X 37.3318,-122.0312
```

`x` / `y` etc. are device points (see `wire-protocol.md` for the
coordinate convention). `width` / `height` come from `chrome layout`.

### Hardware buttons — `press`

```bash
testcat-sim press --udid X --button home                       # short tap
testcat-sim press --udid X --button power --duration 2.5       # Siri / SOS hold
testcat-sim press --udid X --button volume-up
```

| Button           | iOS effect                  | Long-hold (≥ ~0.8 s)              |
|------------------|-----------------------------|-----------------------------------|
| `home`           | Home / app switcher         | n/a                               |
| `lock`           | Sleep / wake                | n/a                               |
| `power`          | Sleep / wake                | Siri (~1.5 s) / SOS slider (~5 s) |
| `volume-up`      | Volume up                   | Accessibility shortcut            |
| `volume-down`    | Volume down                 | Accessibility shortcut            |
| `action`         | iPhone 15 Pro action button | "Hold for Ring" / silent flip     |
| `app-switcher`   | Two consecutive home presses → multitasking cards | n/a (canned shape) |
| `swipe-to-app-switcher` | Slow drag-and-hold from bottom edge → multitasking cards (gesture path) | n/a (canned shape) |
| `swipe-to-home`  | Swipe up from bottom edge → home | n/a (canned shape)           |
| `pull-down-to-lock-screen` | Slow drag down from top-left → lock-screen cover sheet | n/a (canned shape) |
| `pull-down-to-notification-center` | Slow drag down from top-right → Notification Center | n/a (canned shape) |

`--duration <seconds>` is optional (default ~100 ms). `siri` is
explicitly rejected — it crashes `backboardd` through every known
Indigo path. `app-switcher`, `swipe-to-app-switcher`, `swipe-to-home`,
`pull-down-to-lock-screen`, and `pull-down-to-notification-center`
are *virtual* buttons — no physical counterpart, but they're useful
when the agent wants the gesture vocabulary without managing a
streaming touch chain manually. See
[`docs/features/buttons.md`](../../../docs/features/buttons.md) and
[`docs/features/touches.md`](../../../docs/features/touches.md) for
the dispatch path.

### Keyboard — `key` / `type`

```bash
# Single keystroke. `--code` is a W3C KeyboardEvent.code.
testcat-sim key --udid X --code KeyA                          # types 'a'
testcat-sim key --udid X --code KeyA --modifiers shift        # 'A'
testcat-sim key --udid X --code KeyA --modifiers shift,command --duration 0.2

# Multi-character text (US ASCII only).
testcat-sim type --udid X --text "hello world"
testcat-sim type --udid X --text "Login: alice@example.com"
```

Supported codes: `KeyA`–`KeyZ`, `Digit0`–`Digit9`, `Numpad0`–`Numpad9`
(+ `NumpadDecimal|Divide|Multiply|Subtract|Add|Enter|Equal`), `Enter`,
`Escape`, `Backspace`, `Tab`, `Space`, `ArrowUp/Down/Left/Right`, US
punctuation (`Minus`, `Equal`, `BracketLeft`, …). Modifiers: `shift`,
`control`, `option`, `command` (comma-separated on the CLI). Phase-1
limits: **no IME, no emoji, no accented characters** — those go through
`paste` instead. See
[`docs/features/keyboard.md`](../../../docs/features/keyboard.md).

### Pasteboard — `paste` / `clipboard`

```bash
# Any unicode into the focused field: sets the sim pasteboard
# (xcrun simctl pbcopy), then presses Cmd+V.
testcat-sim paste --udid X --text "café ☕ user-1@example.com"
testcat-sim paste --udid X --text "…" --no-press   # pasteboard only, no Cmd+V

testcat-sim clipboard get  --udid X   # print the sim's pasteboard text (raw, no trailing newline)
testcat-sim clipboard sync --udid X   # host Mac clipboard → sim, full-fidelity (images included)
testcat-sim clipboard copy --udid X   # sim → host Mac clipboard, full-fidelity
```

`paste` prints `{"ok":true,"action":"paste"}` on success. The first paste
into a freshly installed app triggers iOS's "Allow Paste" alert — see
"Text entry" in SKILL.md.

### Simulated GPS — `location`

```bash
testcat-sim location set   --udid X 37.3318,-122.0312    # pin a lat,lon position
testcat-sim location start --udid X --speed 30 40.9903,29.0290 41.0082,28.9784
                                                          # moving route over 2+ waypoints
testcat-sim location clear --udid X                       # restore live values
```

Positions are single `lat,lon` tokens (not `--lat`/`--lon` — a leading `-`
on a western longitude would parse as a flag). For a *latitude* that starts
with `-`, put `--` before the token: `location set --udid X -- -37.6,144.9`.
`start` also takes `--distance <metres>` / `--interval <seconds>` between
updates. Latitude is validated to ±90, longitude to ±180, waypoints ≥ 2.
Set the location **before** launching the app under test so the first
CoreLocation fix already sees it.

## Streaming gestures — `input`

```bash
testcat-sim input --udid <UDID>                # reads stdin, writes acks per line
```

Use for sequences. Reading stops on EOF. Pair with `tee` for logging:

```bash
{ echo '{"type":"button","button":"home"}'
  echo '{"type":"tap","x":219,"y":478,"width":438,"height":954}'
} | testcat-sim input --udid X | tee /tmp/testcat-sim-acks.log
```

## One-shot screenshot — `screenshot`

```bash
testcat-sim screenshot --udid <UDID>                              # → JPEG on stdout
testcat-sim screenshot --udid <UDID> --output /tmp/shot.jpg
testcat-sim screenshot --udid <UDID> --quality 0.6 --scale 2 > thumb.jpg
```

| Flag       | Default | Effect                                                       |
|------------|---------|--------------------------------------------------------------|
| `--output` | stdout  | Write JPEG bytes to a file instead of stdout (CLI only).     |
| `--quality`| `0.85`  | JPEG lossy compression (0.0 – 1.0).                          |
| `--scale`  | `1`     | Integer downscale divisor: 1 = native, 2 = half, 3 = third.  |


**Failure modes:**
- **2 s timeout / `Failure.timeout`.** SimulatorKit only emits a frame
  on a screen change. A booted-but-idle simulator (lock screen with no
  visible clock tick, headless test runner waiting on input) may never
  produce a frame. Wake the screen with a gesture before capturing:
  ```bash
  testcat-sim tap --udid X --x 1 --y 1 --width "$W" --height "$H"
  sleep 0.2
  testcat-sim screenshot --udid X --output /tmp/shot.jpg
  ```
- **Unknown UDID.** HTTP returns `404 application/json {"ok":false,"error":"unknown udid: <udid>"}`;
  CLI exits non-zero with the same message on stderr.

**Limits:** JPEG only (no PNG / WebP / AVIF yet); raw framebuffer (no
bezel composite — that's a browser-side concern via `bezel.png`).

## Accessibility tree — `describe-ui`

```bash
testcat-sim describe-ui --udid <UDID>                                   # full frontmost-app tree, JSON to stdout
testcat-sim describe-ui --udid <UDID> --x 172 --y 880                   # hit-test: topmost AX node at (172, 880)
testcat-sim describe-ui --udid <UDID> --output /tmp/tree.json
```

Returns one JSON object (the root `AXNode`) per call:

```json
{
  "role": "AXButton",
  "subrole": null,
  "label": "Safari",
  "value": null,
  "identifier": "Safari",
  "title": null,
  "help": "Double tap to open",
  "frame": { "x": 136, "y": 844.33, "width": 72, "height": 72 },
  "enabled": true, "focused": false, "hidden": false,
  "children": []
}
```

`frame` is in **device points** — same units as `tap` / `swipe`
wire fields (`x`, `y`, `width`, `height`). An agent that wants to
"tap the Safari button" reads `frame.x + frame.width/2`,
`frame.y + frame.height/2` straight back into a `tap` envelope.

| Flag       | Default | Effect                                                       |
|------------|---------|--------------------------------------------------------------|
| `--x`      | unset   | Hit-test x coordinate (device points). Pair with `--y`.      |
| `--y`      | unset   | Hit-test y coordinate (device points). Pair with `--x`.      |
| `--output` | stdout  | Write the JSON to a file instead of stdout.                  |

Both `--x` and `--y` must be given together; either alone errors.

**Failure modes:**
- **`no accessibility data`** — simulator not booted, or the
  frontmost slot is empty (e.g. lock screen with nothing focused).
  Exits non-zero. Wake the screen with a gesture or boot the sim.
- **Framework load failure.** `testcat-sim` logs `[ax]` lines on
  stderr; the CLI exits non-zero. Most common cause is running on
  an Xcode older than 26 — the dispatcher recipe targets iOS 26+.

## Live unified log — `logs`

```bash
testcat-sim logs --udid <UDID>                                 # info-and-above, line-buffered to stdout
testcat-sim logs --udid <UDID> --level debug                   # everything including debug-level chatter
testcat-sim logs --udid <UDID> --style json                    # one JSON object per line
testcat-sim logs --udid <UDID> --bundle-id com.apple.MobileSafari
testcat-sim logs --udid <UDID> --predicate 'subsystem == "com.apple.UIKit"'
testcat-sim logs --udid <UDID> | grep -i error                 # composes with shell pipelines; SIGINT to stop
```

| Flag           | Default   | Effect                                                            |
|----------------|-----------|-------------------------------------------------------------------|
| `--level`      | `info`    | `default` \| `info` \| `debug`. iOS-runtime `log stream` accepts only these three; **not** `notice / error / fault`. |
| `--style`      | `default` | `default` \| `compact` \| `json` \| `ndjson` \| `syslog`.         |
| `--predicate`  | unset     | Raw `NSPredicate` passed to `log stream --predicate` verbatim.    |
| `--bundle-id`  | unset     | Shorthand → `process == "<id>"`. ANDs with `--predicate` when both given. |


```
WS  /simulators/<UDID>/logs?level=info&style=default[&predicate=…&bundleId=…]
→ {"type":"log_started"}
→ {"type":"log","line":"<entry>"}
→ {"type":"log_stopped","reason":"…"}
```

Filter is fixed at connect time — restart the socket to change it. Send `{"type":"stop"}` to terminate early.

**Failure modes:**
- **`logs: invalid --level '<x>'`** — the simulator's `log` binary only accepts `default | info | debug`. Map `error` / `fault` requirements onto a predicate (`messageType == 'error'`).
- **Spawn failure.** Surfaced on stderr as `logs: <error>`. Most common: simulator not booted.
- **Slow consumer (WS only).** Buffered to 2048 lines per socket; older lines drop silently if the client falls behind.

## Live frame stream — `stream`

```bash
testcat-sim stream --udid <UDID> --format mjpeg --fps 60
testcat-sim stream --udid <UDID> --format avcc  --fps 60      # H.264 NAL units
```

Writes the live encoded stream to stdout. Pipe to `ffplay` or a
recording sink. For a single still image use `testcat-sim screenshot`
above — it has no encoder warm-up cost and respects a clean 2 s
timeout. `stream | head -c …` is *not* the snapshot path; the live
stream pipeline interferes with concurrent gestures.

## Continuous MJPEG — `screencast` (for testcat's own grid, not agents)

```bash
testcat-sim screencast --udid <UDID> [--scale 2] [--quality 0.6] [--fps ...]
```

Continuously writes MJPEG frames to stdout; the testcat desktop app uses
this to paint its live device grid. Agents should not start it — use
`screenshot` for verification captures. There is **no `serve` command**
in this fork (the upstream web UI was removed).

## Orientation — `orientation`

```bash
testcat-sim orientation --udid <UDID> portrait
testcat-sim orientation --udid <UDID> landscape-left     # also: landscape-right, portrait-upside-down
```

Rotates the booted simulator's interface. Re-run `describe-ui` afterwards —
frames and the root size change with the rotation.

## Status bar — `status-bar override|clear`

```bash
testcat-sim status-bar override --udid <UDID> --time "9:41" --battery-level 100 \
  --battery-state charged --wifi-bars 3 --cellular-bars 4
testcat-sim status-bar clear --udid <UDID>
```

Pins clock/battery/signal for deterministic screenshots. Flags: `--time`,
`--operator-name`, `--data-network`, `--wifi-mode searching|failed|active`,
`--wifi-bars 0-3`, `--cellular-mode`, `--cellular-bars`, `--battery-state`,
`--battery-level`. `clear` removes every override.

## Bezel rasterisation — `chrome composite`

```bash
testcat-sim chrome composite --udid <UDID>            > bezel.png
testcat-sim chrome composite --device-name "iPhone 17 Pro Max" > bezel.png
```

Returns the device chrome (rounded glass + buttons) as a PNG, suitable
for compositing under a captured screenshot.

## Exit codes

`0` on success. `1` on any error; the JSON error body explains. Errors
that come from SimulatorHID (wrong UDID, device not booted, malformed
gesture) return `{"ok":false,"error":"…"}` and exit `1` — parse stdout,
not just the exit code.
