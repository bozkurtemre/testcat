# testcat-device upstream

`testcat-device` vendors the iOS physical-device runtime from Callstack
`agent-device`.

- Upstream: https://github.com/callstack/agent-device
- Package: `agent-device@0.17.6`
- License: MIT
- Vendored contents: packaged CLI runtime (`bin`, `dist`) and the iOS XCTest
  runner (`ios-runner`).

The public command surface is owned by Testcat and is intentionally restricted
to the iOS physical-device commands exposed by `native/testcat-device/testcat-device`.
The packaged upstream `dist` bundle may contain shared code for other platforms,
but Testcat v1 does not expose those commands. Do not ask users to install or
run `agent-device` directly; update this vendored runtime deliberately when
upstream physical-device behavior needs to be refreshed.
