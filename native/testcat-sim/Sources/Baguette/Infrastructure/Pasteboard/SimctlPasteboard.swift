import Foundation

/// `Pasteboard` backed by `xcrun simctl pbcopy | pbpaste | pbsync`.
///
/// The orchestration here is pure: argv assembly + the `Subprocess`
/// exit handshake, with the paste text riding the child's stdin
/// (`pbcopy` reads its payload there — the reason `Subprocess` grew
/// a stdin-carrying `run` variant). The `Foundation.Process`
/// plumbing lives in `HostSubprocess` (already vendored for
/// `LogStream`), so this file is unit-covered end-to-end via
/// `MockSubprocess` — only the real spawn is integration-only.
final class SimctlPasteboard: Pasteboard, @unchecked Sendable {
    private let udid: String
    private let subprocess: any Subprocess
    private let xcrun: URL

    init(
        udid: String,
        subprocess: any Subprocess = HostSubprocess(),
        xcrun: URL = URL(fileURLWithPath: "/usr/bin/xcrun")
    ) {
        self.udid = udid
        self.subprocess = subprocess
        self.xcrun = xcrun
    }

    func setText(_ text: String) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            do {
                try subprocess.run(
                    executable: xcrun,
                    arguments: ["simctl", "pbcopy", udid],
                    stdin: Data(text.utf8),
                    onBytes: { _ in },
                    onExit: { code in
                        if code == 0 {
                            continuation.resume()
                        } else {
                            continuation.resume(throwing: PasteboardError.simctlFailed(status: code))
                        }
                    }
                )
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    func text() async throws -> String {
        try await capture(["simctl", "pbpaste", udid])
    }

    func syncFromHost() async throws {
        _ = try await capture(["simctl", "pbsync", "host", udid])
    }

    func syncToHost() async throws {
        _ = try await capture(["simctl", "pbsync", udid, "host"])
    }

    /// Run `xcrun` collecting stdout; resolve with the collected
    /// output on exit 0, throw `simctlFailed` otherwise.
    private func capture(_ arguments: [String]) async throws -> String {
        final class Collected: @unchecked Sendable {
            var data = Data()
            let lock = NSLock()
            func append(_ bytes: Data) {
                lock.lock(); data.append(bytes); lock.unlock()
            }
            func string() -> String {
                lock.lock(); defer { lock.unlock() }
                return String(decoding: data, as: UTF8.self)
            }
        }
        let collected = Collected()
        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
            do {
                try subprocess.run(
                    executable: xcrun,
                    arguments: arguments,
                    onBytes: { collected.append($0) },
                    onExit: { code in
                        if code == 0 {
                            continuation.resume(returning: collected.string())
                        } else {
                            continuation.resume(throwing: PasteboardError.simctlFailed(status: code))
                        }
                    }
                )
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }
}
