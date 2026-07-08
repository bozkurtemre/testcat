# testcat-sim

Headless iOS-simulator control CLI for testcat — a fork of
[tddworks/baguette](https://github.com/tddworks/baguette) (Apache-2.0) with the
web/serve layer removed and the binary renamed. See [NOTICE](NOTICE).

testcat drives the simulator through this CLI for **control** (tap / swipe /
boot / describe-ui / …) and renders the **live view** itself by consuming
`testcat-sim stream` — there is no built-in web server.

## Build

```bash
swift build -c release     # → .build/release/testcat-sim
./build.sh                 # builds + copies the binary to ./testcat-sim
```

Requires Xcode 26 + Apple Silicon (reaches SimulatorKit / CoreSimulator via
`dlopen` at runtime; nothing private is linked at build time).

## Use

```bash
testcat-sim list --json
testcat-sim boot --udid <UDID>
testcat-sim stream --udid <UDID> --format mjpeg     # framebuffer → stdout (MJPEG)
testcat-sim tap --udid <UDID> --x 219 --y 478 --width 438 --height 954
testcat-sim screenshot --udid <UDID> --output /tmp/frame.jpg
testcat-sim complete --status passed --summary "Verified checkout success"
```
