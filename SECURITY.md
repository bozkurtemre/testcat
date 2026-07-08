# Security Policy

## Supported versions

Only the latest release (and the `main` branch) receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Instead, use GitHub's private vulnerability reporting ("Report a vulnerability" under the repository's
Security tab). You'll get an acknowledgement within a few days.

Things worth reporting include (but aren't limited to):

- Escapes from the renderer sandbox / preload bridge (`contextIsolation`, `sandbox`, IPC surface)
- Command injection through scenario prompts, profiles, or agent output parsing
- Credential leakage — run events are expected to redact generated account credentials
- Path traversal via build (.app) inspection or run media handling
