# CLAUDE.md — testcat-sim

Vendored Swift fork of [tddworks/baguette](https://github.com/tddworks/baguette)
(Apache-2.0), with the web/serve layer removed and the binary renamed to
`testcat-sim`. See [NOTICE](NOTICE) for the full list of changes.

- **Build:** `swift build -c release` (or `./build.sh`). Requires Xcode 26 +
  Apple Silicon. The camera dylib is vendored prebuilt under
  `Sources/Baguette/Resources/VirtualCamera/`.
- **Do NOT re-add the web/serve layer** (Hummingbird, `Infrastructure/Server`,
  `Resources/Web`, `/farm`, the `serve` command). testcat renders the live grid
  itself by spawning `testcat-sim stream`.
- This is vendored third-party code — keep changes minimal and surgical, and
  preserve the Apache LICENSE + NOTICE.
- The internal Swift module is still named `Baguette` (path `Sources/Baguette`);
  only the executable product is renamed. Leave the module name unless there's a
  reason to churn every file.
