# Wire protocol — `testcat-sim input` / WebSocket

Newline-delimited JSON. One gesture per line. `testcat-sim input` writes
`{"ok":true}` or `{"ok":false,"error":"…"}` per line on stdout. The
WebSocket at `/simulators/<udid>/stream` accepts the same dialect.

## The coordinate convention (do not skip)

All `x`, `y`, `startX`, `startY`, `endX`, `endY`, `x1`, `y1`, `x2`, `y2`,
`cx`, `cy` are in **device points** — the same units as the `width` and
`height` you pass on the same line.

`width` and `height` come from `testcat-sim chrome layout --udid <UDID>`'s
`screen.width` / `screen.height`. They are device-specific. Hardcoding
"438×954" only works for iPhone 17 Pro Max.

The wire format is **not normalized**. `x:0.5, y:0.5` will tap pixel
(0, 0) on the device. The HID adapter normalises internally on the
server side; clients always send points.

## Single-tap

```json
{"type":"tap","x":219,"y":478,"width":438,"height":954,"duration":0.05}
```

`duration` is the dwell time in seconds. Default ~0.05 if omitted.

## Double-tap (4 lines, one connection)

There is no `{"type":"double-tap"}` envelope. UIKit's
`UITapGestureRecognizer(numberOfTapsRequired: 2)` and SwiftUI's
`TapGesture(count: 2)` both fire when two `touch1-down`/`touch1-up`
pairs arrive at the same coordinate within ~250 ms, so the existing
streaming primitives already cover this:

```json
{"type":"touch1-down","x":219,"y":478,"width":438,"height":954}
{"type":"touch1-up",  "x":219,"y":478,"width":438,"height":954}
{"type":"touch1-down","x":219,"y":478,"width":438,"height":954}
{"type":"touch1-up",  "x":219,"y":478,"width":438,"height":954}
```

Send all four on **one** connection (one `testcat-sim input` process,
one WS); separate processes spend too long in startup for the
recognizer to aggregate. A known-good cadence is ~80 ms hold per
tap and ~50 ms gap between taps. For a one-shot CLI shape with the
same recipe baked in, use `testcat-sim double-tap` — see
[`docs/features/double-tap.md`](../../../docs/features/double-tap.md).

## Swipe (one-shot, server interpolates)

```json
{"type":"swipe","startX":219,"startY":760,"endX":219,"endY":190,
                "width":438,"height":954,"duration":0.3}
```

`duration` is end-to-end. Server interpolates intermediate points; you
do not need to stream `move` events for a one-shot swipe.

## Streaming gestures (phase-driven)

Use these for real-time drags / multi-finger choreography where
intermediate samples come from a UI loop (mouse-move handler, etc.).

### One finger

```json
{"type":"touch1-down","x":219,"y":478,"width":438,"height":954}
{"type":"touch1-move","x":225,"y":485,"width":438,"height":954}
{"type":"touch1-move","x":230,"y":492,"width":438,"height":954}
{"type":"touch1-up",  "x":230,"y":492,"width":438,"height":954}
```

Pair every `down` with an `up`. `move` is optional but typically
streamed at ~60 Hz from the input source.

#### Optional `edge` field — system gesture flag

```json
{"type":"touch1-down","x":219,"y":950,"width":438,"height":954,"edge":"bottom"}
{"type":"touch1-move","x":219,"y":700,"width":438,"height":954,"edge":"bottom"}
{"type":"touch1-move","x":219,"y":500,"width":438,"height":954,"edge":"bottom"}
{"type":"touch1-up",  "x":219,"y":500,"width":438,"height":954,"edge":"bottom"}
```

`edge` accepts `bottom` / `top` / `left` / `right`. When set, every
event in the chain is flagged as an `IndigoHIDEdge` system gesture.
`bottom` engages iOS's home-indicator gesture recognizer — fast
swipe → Home, slow drag-and-hold near midpoint → App Switcher,
with iOS animating the live preview as the events stream. Omit
`edge` for ordinary interior touches. See
[`docs/features/touches.md`](../../../docs/features/touches.md) for
the full dispatch recipe.

### Two fingers (the primary pinch / pan path)

```json
{"type":"touch2-down","x1":175,"y1":478,"x2":263,"y2":478,"width":438,"height":954}
{"type":"touch2-move","x1":150,"y1":478,"x2":288,"y2":478,"width":438,"height":954}
{"type":"touch2-up",  "x1":150,"y1":478,"x2":288,"y2":478,"width":438,"height":954}
```

`UIPinchGestureRecognizer` requires two fingers. Single-finger streaming
(`touch1-*`) routes correctly but iOS treats it as an interactive pan,
not a pinch — prefer `touch2-*` for any zoom / rotate scenario.

## One-shot pinch

```json
{"type":"pinch","cx":219,"cy":478,
                "startSpread":60,"endSpread":240,
                "width":438,"height":954,"duration":0.6}
```

`cx`/`cy` is the centre of the pinch in device points. `startSpread` /
`endSpread` are the finger separation in points (60 → 240 = zoom-in).
Server interpolates 10 intermediate two-finger samples over `duration`.

## One-shot parallel pan (two fingers)

```json
{"type":"pan","x1":175,"y1":478,"x2":263,"y2":478,
              "dx":0,"dy":200,
              "width":438,"height":954,"duration":0.5}
```

Both fingers translate by `(dx, dy)` in points over `duration`. Useful
for two-finger scrolling in apps that ignore single-finger pans
(e.g., Maps).

## Scroll wheel

```json
{"type":"scroll","deltaX":0,"deltaY":-50}
```

Negative `deltaY` scrolls content up (same convention as macOS). No
`width` / `height` needed — scroll is target-agnostic.

## Hardware buttons

```json
{"type":"button","button":"home"}
{"type":"button","button":"lock"}
{"type":"button","button":"power"}
{"type":"button","button":"volume-up"}
{"type":"button","button":"volume-down"}
{"type":"button","button":"action","duration":1.2}
{"type":"button","button":"app-switcher"}
{"type":"button","button":"swipe-to-app-switcher"}
{"type":"button","button":"swipe-to-home"}
{"type":"button","button":"pull-down-to-lock-screen"}
{"type":"button","button":"pull-down-to-notification-center"}
```

Allowed names: `home | lock | power | volume-up | volume-down | action | app-switcher | swipe-to-app-switcher | swipe-to-home | pull-down-to-lock-screen | pull-down-to-notification-center`.
`duration` is the optional hold time in seconds — `0`/absent → ~100 ms
short tap; longer holds drive iOS long-press semantics ("Hold for
Ring" on `action`, Siri / SOS on `power`, etc.). The browser bezel
overlay measures real `mousedown` → `mouseup` and forwards the
elapsed time, so click-and-hold on a side button just works.

`app-switcher`, `swipe-to-app-switcher`, `swipe-to-home`,
`pull-down-to-lock-screen`, and `pull-down-to-notification-center`
are *virtual* buttons. `app-switcher` rides the home-button event
source (two `IndigoHIDMessageForButton` presses ~150 ms apart —
SpringBoard's own multitasking trigger, works on Face ID iPhones);
the other four synthesize canned system-gesture shapes
(slow drag-with-dwell up; fast edge-swipe up; slow drag down from
top-left; slow drag down from top-right). Use them when the agent
wants the gesture vocabulary without managing a streaming
`touch1-*` chain manually.
For live-preview UX, stream `touch1-*` with `edge: "bottom"` (drag
from canvas bottom — iOS animates home / app-switcher preview) or
`edge: "top"` (drag from canvas top — iOS pulls the lock-screen /
notification-center cover sheet) instead — see "One finger" above.

**Do not propose `button:"siri"`** — it crashes `backboardd` via
every known Indigo path and is rejected by the CLI before reaching
SimulatorHID.

## Keyboard

### Single keystroke

```json
{"type":"key","code":"KeyA"}
{"type":"key","code":"KeyA","modifiers":["shift"]}
{"type":"key","code":"KeyA","modifiers":["shift","command"],"duration":0.2}
{"type":"key","code":"Enter"}
```

`code` is a W3C `KeyboardEvent.code`. Supported set: `KeyA`–`KeyZ`,
`Digit0`–`Digit9`, `Enter`, `Escape`, `Backspace`, `Tab`, `Space`,
`ArrowUp`/`Down`/`Left`/`Right`, US punctuation (`Minus`, `Equal`,
`BracketLeft/Right`, `Backslash`, `Semicolon`, `Quote`, `Backquote`,
`Comma`, `Period`, `Slash`). Modifiers: `shift`, `control`, `option`,
`command`. Unknown codes / modifiers fail the parse with
`{"ok":false,"error":"…"}`.

### Typed text

```json
{"type":"type","text":"hello world"}
{"type":"type","text":"Login: alice@example.com"}
```

Decomposed at parse time into the same `(KeyboardKey, modifiers)`
pairs the wire `key` shape uses, then dispatched in order. **US ASCII
printable only** — non-ASCII (`é`, `中`, `🦄`) fails the parse rather
than silently dropping mid-string.

**Phase-1 limits:** no IME / Pinyin / dead keys / emoji / non-Latin
scripts. For non-ASCII or symbol-heavy text use the pasteboard instead
(there is no `simctl io text` operation): `echo -n "…" | xcrun simctl
pbcopy <UDID>`, then `{"type":"key","code":"KeyV","modifiers":["command"]}`
— see the Text entry section in SKILL.md.

## Stream-control verbs (on `stream` stdin — testcat internal)

There is no `serve` command in this fork. The `stream` command reads the
same control verbs from stdin; testcat's own pipeline uses them — agents
normally never need this section:

```json
{"type":"set_bitrate","bps":4000000}     // re-encode target bitrate
{"type":"set_fps","fps":60}              // re-target capture rate
{"type":"set_scale","scale":1}           // 1=full, 2=half, 3=third
{"type":"force_idr"}                     // request a keyframe now
{"type":"snapshot"}                      // request one snapshot frame
{"type":"describe_ui"}                   // dump the AX tree (frontmost app)
{"type":"describe_ui","x":172,"y":880}   // hit-test the topmost AX node at a point
{"type":"stop"}                          // terminate a /logs subscription early (sent on the logs socket)
```

`describe_ui` replies on the same socket with one text frame:

```json
{ "type": "describe_ui_result", "ok": true, "tree": { /* AXNode */ } }
{ "type": "describe_ui_result", "ok": false, "error": "no accessibility data" }
```

Each `AXNode` carries `role`, `subrole`, `label`, `value`,
`identifier`, `title`, `help`, `frame` (in **device points**, same
units as `tap` / `swipe`), `enabled` / `focused` / `hidden`, and a
recursive `children` array. Use it as the structured-context
counterpart to `screenshot.jpg` — pair the screenshot with the
tree, or skip the image and act on the labels and frames directly.

These do not exist for `testcat-sim input` (no stream there).

## Logs — CLI only in this fork

There is no logs WebSocket (no `serve`). Stream the unified log with the
CLI and stop it with SIGINT (Ctrl-C):

```bash
testcat-sim logs --udid <UDID> [--level debug|info|notice|error|fault] \
  [--style default|compact|json|syslog] [--predicate '...'] [--bundle-id <id>]
```

Default level is `info`. `--bundle-id` is the convenient per-app filter.

## Virtual camera — internal, no agent path

The fork ships `VirtualCamera.dylib` (webcam → simulator camera feed), but
its control channel is internal to the testcat pipeline. There is no
agent-facing CLI for it — don't propose camera injection in test runs.


## Debugging a "tap missed"

If a tap visibly happens on the wrong spot:

1. Did you pass `width` / `height` from `chrome layout --udid <SAME-UDID>`?
   A tap with the wrong device's dimensions normalises to the wrong fraction.
2. Are coordinates in points, not pixels? iPhone 17 Pro Max screen is
   438×954 points (×3 = 1206×2622 pixels). Pixels overshoot by 3×.
3. Did the app fully load? A tap during a launch animation hits whatever
   was underneath. `sleep 0.5` after navigation is cheap insurance.