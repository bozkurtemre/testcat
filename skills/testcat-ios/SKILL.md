---
name: testcat-ios
description: |
  Drive iOS simulators via the `testcat-sim` CLI — taps, swipes, gestures,
  hardware buttons, screenshots, keyboard input, and the on-screen
  accessibility tree, without Xcode. Use when running a testcat scenario:
  boot/select a simulator, install & launch the build under test, drive the
  UI, and verify on-screen state. testcat renders the live view itself — this
  skill is for control, not for streaming to a browser.
---

# testcat-ios — programmatic iOS simulator control

`testcat-sim` is a macOS CLI that drives iOS simulators directly via Apple's
private `SimulatorHID` (the same path Xcode uses internally). It works on
**iOS 26 + Xcode 26 + Apple Silicon** and is faster + more reliable than
`idb` / `AXe` / `simctl io` for input.

This skill is for **agents running a testcat scenario against a booted
simulator** (taps, swipes, screenshots, gesture sequences). testcat shows the
live simulator view in its own UI — you don't need to start any server.

Important naming: `testcat-ios` is this skill's name, not a command-line
binary. Do not run `which testcat-ios`, `testcat-ios --version`, or any
`testcat-ios ...` shell command. The simulator executable CLI is
`testcat-sim`; the physical iPhone/iPad executable CLI is `testcat-device`.

> `testcat-sim` is forked from tddworks/baguette (Apache-2.0), with the
> web/serve layer removed. It ships with testcat. The desktop app may set
> `TESTCAT_SIM_BIN` to its absolute path; otherwise it should be on `PATH`.
> If neither works, the user must finish testcat setup (install the testcat-ios
> skill from onboarding / Settings). Do not fall back to opening Simulator.app.
>
> `testcat-device` ships with testcat and vendors the required physical-device
> XCTest runner runtime. The desktop app may set `TESTCAT_DEVICE_BIN` to its
> absolute path. Do not ask the user to install upstream `agent-device`.

## Headless-only contract

testcat owns the live simulator preview. Your job is to control the simulator
headlessly.

- Prose is not simulator control. Do not write that `testcat-ios` was used, that
  the app was installed, or that the screen was verified unless you actually ran
  the corresponding `${TESTCAT_SIM_BIN:-testcat-sim}` shell command in the
  transcript.
- If the scenario asks you to plan, use subagents, run simulators in parallel,
  or split the work, honor that instruction when the current CLI/model exposes
  delegation. Keep the main run responsible for the final testcat completion
  marker. If delegation is unavailable, continue directly and say that
  subagent tooling was unavailable. Do not call `update_plan`, and do not stop
  after writing a plan. If `TESTCAT_WARMUP_JSON` is empty or not an `ok: true`
  warm-up, your first visible action must be the shell command
  `${TESTCAT_SIM_BIN:-testcat-sim} list --json`. If `TESTCAT_WARMUP_JSON`
  contains an `ok: true` warm-up, testcat already listed, booted, installed,
  launched, and inspected the reserved simulator; your first visible action
  must verify the current UI on `warmup.device.udid` with
  `${TESTCAT_SIM_BIN:-testcat-sim} describe-ui --udid <UDID>`.
- Do not ask the user for confirmation or permission while running a test.
  Continue autonomously with the available tools and report a blocker only after
  the possible headless alternatives have been tried.
- If `TESTCAT_ASSIGNED_DEVICES_JSON` contains physical devices, use those first
  with `${TESTCAT_DEVICE_BIN:-testcat-device}`. Physical devices do not use
  `boot` or `chrome layout`; run `prepare`, `install`, `launch`, `describe-ui`,
  then interact with `tap`, `fill`, `type`, `swipe`, `scroll`, `press`, and
  `screenshot`. If more devices are required than the assigned physical
  devices, use simulator fallback through `${TESTCAT_SIM_BIN:-testcat-sim}`.
- Physical-device interaction contract: `describe-ui` returns `@eN` refs —
  use them. Tap with `tap --udid <UDID> --ref @eN` (or explicit `--x/--y`
  coordinates); never pass identifiers or labels as positional arguments —
  the error "tap requires --x and --y, or a snapshot ref" means exactly that.
  TEXT ENTRY on physical devices: use
  `fill --udid <UDID> --ref @eN --text "<text>"` — it focuses the field and
  types in one step, and is keyboard-layout safe. The simulator pasteboard
  trick (`simctl pbcopy` + Cmd+V) does NOT exist for physical devices; do not
  attempt it there.
- Physical device lock: if `describe-ui` shows the lock screen (passcode
  prompt / lock-screen clock), the session drops with a lost-connection
  error mid-run, or a command fails with a hint like "Ensure the iOS device
  is unlocked, trusted, and available", the device is locked or untrusted —
  UI automation cannot continue and no retry will help. Retry at most once,
  then end immediately with
  `${TESTCAT_DEVICE_BIN:-testcat-device} complete --status failed --summary
  "Device locked/untrusted — unlock it, trust the developer profile (Settings
  > General > VPN & Device Management), and set Auto-Lock to Never"`.
  There is no `open` command; sessions come from a successful `launch`.
- If `TESTCAT_ASSIGNED_SIMULATORS_JSON` contains simulator entries, use those
  reserved simulator UDIDs for this run. If there is no successful warm-up,
  do this after the required `list --json` command. If a reserved simulator is
  `Shutdown`, boot that reserved UDID instead of switching to a different
  already-booted simulator.
- If `TESTCAT_IN_USE_DEVICES_JSON` contains devices reserved by active runs,
  never choose a simulator reserved by another run. A booted simulator is not
  automatically safe to reuse.
- Required lifecycle sequence without a successful warm-up: list devices,
  choose a UDID, boot it if its state is not `Booted`, confirm it is `Booted`,
  install the app, launch the app, then interact/verify.
- Required lifecycle sequence with a successful `TESTCAT_WARMUP_JSON`: stay on
  the warmed-up reserved UDID, verify with `describe-ui`, then interact/verify.
  Do not repeat device selection, install, or launch unless verification shows
  the app is unavailable.
- Prefer the simulator reserved for this run. If no simulator was assigned,
  prefer an already running, non-reserved iPhone. If none exists, choose the
  available non-reserved iPhone with the newest iOS runtime and newest device
  model.
- Boot a shutdown simulator with exactly
  `${TESTCAT_SIM_BIN:-testcat-sim} boot --udid <UDID>`. Never use `launch` as a
  boot command.
- Never run `install` against a simulator whose latest listed state is
  `Shutdown`. If install fails with `Unable to lookup in current state:
  Shutdown`, run `boot --udid <UDID>`, re-run `list --json`, then retry install
  once before reporting a setup blocker.
- Do not run `open -a Simulator`, open Xcode's `Simulator.app` directly, or use
  any fallback whose purpose is to show the native Simulator window.
- Install and launch the `.app` through
  `${TESTCAT_SIM_BIN:-testcat-sim} install --udid <UDID> --app <APP_PATH>` and
  `${TESTCAT_SIM_BIN:-testcat-sim} launch --udid <UDID> --app <APP_PATH>
  --terminate-running-process`. Do not call `xcrun simctl install/launch`
  directly unless a `testcat-sim` lifecycle command is missing from the
  installed CLI.
- Install and launch a physical-device `.ipa` or signed `.app` through
  `${TESTCAT_DEVICE_BIN:-testcat-device} install --udid <UDID> --app <APP_PATH>`
  and `${TESTCAT_DEVICE_BIN:-testcat-device} launch --udid <UDID> --app <APP_PATH>`
  or `--bundle-id <BUNDLE_ID>`.
- After the final verification, end every test run with exactly one completion
  marker:
  `${TESTCAT_SIM_BIN:-testcat-sim} complete --status passed --summary "<short
  verified result>"` for simulator-only runs or
  `${TESTCAT_DEVICE_BIN:-testcat-device} complete --status passed --summary
  "<short verified result>"` for physical-device runs. If the observed app
  behavior fails the scenario, use `--status failed` with the observed reason.
  If a real setup blocker prevents continuing after you tried the headless
  alternatives, also call `complete --status failed --summary "<observed
  blocker>"` before exiting. Do not call `complete --status passed` before
  installing, launching, interacting with, and verifying the app. testcat will
  not mark the run finished successfully without this marker.
- If `testcat-sim` is missing from both `TESTCAT_SIM_BIN` and `PATH`, report
  the missing CLI clearly in the run output and stop. Do not switch to visible
  Simulator.app tooling.

## The agent's happy path

```bash
# 1. Find a booted device.
testcat-sim list                       # human-readable
testcat-sim list --json                # machine-readable: {running, available}

# 2. Boot one if nothing is running.
# This is a headless CoreSimulator boot; it must not show Simulator.app.
testcat-sim boot --udid <UDID>

# 3. Install and launch the build under test.
# `launch --app` reads CFBundleIdentifier from Info.plist; no guessing needed.
testcat-sim install --udid <UDID> --app /absolute/path/MyApp.app
testcat-sim launch --udid <UDID> --app /absolute/path/MyApp.app --terminate-running-process

# 4. Get the screen size — you need this for every gesture.
testcat-sim chrome layout --udid <UDID>   # → {screen:{width,height}, ...}

# 5. Drive it.
testcat-sim tap --udid <UDID> --x 219 --y 478 --width 438 --height 954

# 6. Verify what happened (one JPEG of the framebuffer).
testcat-sim screenshot --udid <UDID> --output /tmp/frame.jpg

# 7. Mark the test run complete only after verification.
testcat-sim complete --status passed --summary "Purchased plan and verified success screen"
```

## The coordinate footgun (read this)

**All `x` / `y` / `startX` / `endX` / `x1` / `x2` / `cx` / `cy` are in
device points** — same units as the `width` / `height` you pass alongside.

A "tap at the centre of an iPhone 17 Pro Max" is `x:219, y:478` (half of
**438×954**). It is **not** `x:0.5, y:0.5` (normalized) and **not**
`x:1206, y:2622` (raw pixels). The HID adapter normalises internally.

Resolve the right `width`/`height` for a UDID once and reuse it:

```bash
testcat-sim chrome layout --udid <UDID> | jq '.screen | {width, height}'
# → {"width": 438, "height": 954}
```

Different devices have different point sizes — never hardcode `438×954`.

One caveat: when a **system alert window** is up (ATT prompt, permission
dialogs), its accessibility frames are in the *alert window's* coordinate
space, which can differ from `chrome layout`'s app-screen size (e.g. 420×912
vs 438×954). When tapping elements from `describe-ui`, pass the `width`/
`height` of that same tree's **root node frame** — not a cached
`chrome layout` value — or the tap lands offset from the button.

## One-shot vs streaming gestures

- **One-shot** (`testcat-sim tap / swipe / pinch / pan / press`) — separate
  process per gesture. Right for a handful of distinct interactions. Each
  invocation pays the SimulatorHID setup cost (~50–100ms).
- **Streaming** (`testcat-sim input --udid <UDID>`) — long-running process
  reading newline-delimited JSON gestures from stdin, writing
  `{"ok":true}` / `{"ok":false,"error":…}` per line. Right for sequences of
  many gestures where per-gesture latency matters.

```bash
# Streaming: open the pipe once, send many.
( echo '{"type":"tap","x":219,"y":478,"width":438,"height":954,"duration":0.05}'
  echo '{"type":"swipe","startX":219,"startY":760,"endX":219,"endY":190,"width":438,"height":954,"duration":0.3}'
) | testcat-sim input --udid <UDID>
```

Full wire-format spec: `references/wire-protocol.md`.

## Text entry (read this too)

`type` presses **US keyboard positions** via HID. If the host Mac's hardware
keyboard layout is not US (e.g. Turkish-Q), the simulator maps those positions
through its own layout and the text corrupts silently:
`sim-1@x.com` arrives as `sım*1'xçcom` and the app rejects it. Digits survive;
letters and symbols (`@ . - _`) do not.

For emails, URLs, and anything with symbols, use the **pasteboard** — it is
layout-independent:

```bash
# 1. Focus the field first (tap its center from describe-ui).
# 2. Put the text on the simulator pasteboard (pbcopy reads stdin, NOT an argument):
echo -n "user-1@example.com" | xcrun simctl pbcopy <UDID>
# 3. Paste:
testcat-sim key --udid <UDID> --code KeyV --modifiers command
```

- The **first paste into an app** triggers iOS's "Allow Paste" permission
  alert. Run `describe-ui`, tap its Allow button, then paste again if needed.
  It appears once per app install.
- After typing/pasting, verify the field's `value` in `describe-ui` before
  continuing — never assume the text landed intact.
- To clear a field: `key --code KeyA --modifiers command` then
  `key --code Backspace`.
- `key --code` takes **W3C KeyboardEvent codes**: `Enter` (there is no
  `Return`), `Backspace`, `Tab`, `Space`, `Escape`, `KeyA`–`KeyZ`,
  `Digit0`–`Digit9`, `ArrowUp/Down/Left/Right`.
- Plain digits (OTP codes like `111111`) are safe through `type`.

## Parsing list output

`list --json` returns an object, not an array: `{"running":[…],"available":[…]}`.
With jq, iterate `.running + .available | .[]` — plain `.[]` fails with
"Cannot index array with string".

## Parsing describe-ui output

`describe-ui` writes diagnostic lines like `[baguette] [ax] …` to **stderr**
and the JSON tree to **stdout**. Do not merge them with `2>&1` — the log lines
corrupt the JSON for `jq`/`json.load`. Pipe clean stdout instead:

```bash
testcat-sim describe-ui --udid <UDID> 2>/dev/null | jq '..|select(.identifier? and .frame?)|{identifier,label,frame}'
```

Use plain `2>&1` only when a command fails and you need the error text.

Hit-test mode: `describe-ui --udid <UDID> --x <px> --y <py>` returns only the
node(s) at that point (device points) — cheaper than dumping the full tree
when you just need to know what's under a coordinate.

## Simulated push notifications

`testcat-sim` has no push command; `xcrun simctl push` is the right tool for
notification scenarios and is fine to use directly:

```bash
cat > /tmp/notif.json <<'EOF'
{
  "aps": {
    "alert": { "title": "MyApp", "body": "Your friend accepted the invite" },
    "sound": "default",
    "badge": 1
  },
  "customKey": "custom-value"
}
EOF
xcrun simctl push <UDID> <BUNDLE_ID> /tmp/notif.json
sleep 2   # banner animation
testcat-sim describe-ui --udid <UDID> 2>/dev/null   # banner is in the tree — tap it by its frame center
```

Remember this simulates the push **delivery**, not the backend that sends it:
a tapped banner exercises the app's notification routing, but it does not
prove the server actually emits that notification.

## Visual verification

After driving a flow, confirm state with a one-shot framebuffer JPEG:

```bash
testcat-sim screenshot --udid <UDID> --output /tmp/frame.jpg
testcat-sim screenshot --udid <UDID> --quality 0.6 --scale 2 > thumb.jpg
```

Then `Read /tmp/frame.jpg` to inspect it. Note: SimulatorKit only emits a
frame when the screen changes — a booted-but-idle sim may time out
(`Failure.timeout`). Nudge it first if capturing a static state:

```bash
testcat-sim tap --udid <UDID> --x 1 --y 1 --width "$W" --height "$H"
sleep 0.2
testcat-sim screenshot --udid <UDID> --output /tmp/frame.jpg
```

## What's wired vs what isn't

Wired (use freely): `install`, `launch`, `terminate`, `uninstall`; `tap`,
`double-tap`, `swipe`, `touch1-*`, `touch2-*`, `pinch`, `pan`, `scroll`
(with optional `edge: bottom|top|left|right` for system gestures);
`press` hardware buttons (`home`, `lock`, `power`, `volume-up`, `volume-down`,
`action`, `app-switcher`, `swipe-to-app-switcher`, `swipe-to-home`,
`pull-down-to-lock-screen`, `pull-down-to-notification-center`); `key` /
`type` (US-ASCII — see "Text entry" above for the keyboard-layout footgun);
`describe-ui` (on-screen accessibility tree as JSON, frames
in device points — feed `frame.x + frame.width/2` straight back into a `tap`;
`--x/--y` for a point hit-test);
`logs` (stream the booted sim's unified log to stdout);
`orientation` (`portrait | landscape-left | landscape-right |
portrait-upside-down` — for rotation scenarios);
`status-bar override|clear` (pin time/battery/signal for deterministic
screenshots).

NOT wired (don't propose): non-ASCII or symbol-heavy `type` (use the
pasteboard method in "Text entry" — there is no `simctl io text` operation),
F-keys / Page Up/Down through `key`, `button: "siri"` (crashes backboardd —
refused by the CLI).

## Smoke-test pattern

```bash
#!/usr/bin/env bash
set -euo pipefail
UDID="$1"
read W H < <(testcat-sim chrome layout --udid "$UDID" | jq -r '.screen | "\(.width) \(.height)"')
testcat-sim install --udid "$UDID" --app /absolute/path/MyApp.app
testcat-sim launch --udid "$UDID" --app /absolute/path/MyApp.app --terminate-running-process
testcat-sim press --udid "$UDID" --button home
sleep 0.4
testcat-sim tap --udid "$UDID" --x $((W * 75 / 100)) --y $((H * 55 / 100)) --width "$W" --height "$H"
testcat-sim screenshot --udid "$UDID" --output /tmp/proof.jpg
testcat-sim complete --status passed --summary "Smoke flow completed and proof screenshot captured"
```

Resolve `width`/`height` once, reuse for every gesture — same coordinate
convention everywhere.

## Reference files

- `references/wire-protocol.md` — every gesture type with copy-pasteable JSON.
- `references/cli.md` — full subcommand list, flags, exit/output format.

Read on demand — don't pull both into context unless the task needs the breadth.
