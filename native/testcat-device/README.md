# testcat-device

Testcat-owned physical iOS device CLI.

This package vendors the iOS physical-device runtime from `agent-device` and
exposes a stable Testcat command surface. It is intentionally separate from the
user-facing `testcat-ios` skill: agents use the skill name, while Testcat
injects `TESTCAT_DEVICE_BIN` when a run is assigned a physical device.

## Build / smoke

```bash
make testcat-device-build
native/testcat-device/testcat-device list --json
```

`make testcat-device-build` also installs the vendored `agent-device`
production dependencies and runs `testcat-device doctor`. Do not rely on
`--version` alone; it does not load the upstream runtime dependencies used by
`prepare`, `install`, `describe-ui`, and input commands.

Physical-device interaction requires Xcode, `xcrun devicectl`, a paired trusted
iOS device, Developer Mode, and a signed XCTest runner. Signing is configured
with `TESTCAT_DEVICE_IOS_TEAM_ID` and optional related `TESTCAT_DEVICE_IOS_*`
environment variables; the wrapper maps them to the vendored runtime.
