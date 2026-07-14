import Foundation

/// Production `Subprocess` — wraps a `Foundation.Process` plus a
/// stdout/stderr `Pipe`. The only Infrastructure code in the logs
/// path that touches the real OS spawn pipeline. Integration-only
/// (manually smoke-tested via `baguette logs` against a booted
/// simulator); the orchestrator's behaviour is unit-covered
/// against `MockSubprocess`.
///
/// Single-shot — one `run(...)` call per instance. Re-running
/// would risk leaking the previous Process / Pipe.
final class HostSubprocess: Subprocess, @unchecked Sendable {
    private let lock = NSLock()
    private var process: Process?
    private var pipe: Pipe?

    init() {}

    deinit {
        if let process, process.isRunning { process.terminate() }
        try? pipe?.fileHandleForReading.close()
        try? pipe?.fileHandleForWriting.close()
    }

    func run(
        executable: URL,
        arguments: [String],
        onBytes: @escaping @Sendable (Data) -> Void,
        onExit:  @escaping @Sendable (Int32) -> Void
    ) throws {
        // Detach from any controlling terminal. Without this a
        // SIGINT handed to the parent (Ctrl-C in `baguette logs`)
        // would also kill the child via the foreground pgid
        // before the parent's own SIGTERM handler runs.
        try run(
            executable: executable, arguments: arguments,
            standardInput: FileHandle.nullDevice, stdinData: nil,
            onBytes: onBytes, onExit: onExit
        )
    }

    func run(
        executable: URL,
        arguments: [String],
        stdin: Data,
        onBytes: @escaping @Sendable (Data) -> Void,
        onExit:  @escaping @Sendable (Int32) -> Void
    ) throws {
        // A pipe has no controlling tty, so the SIGINT detachment
        // concern of the no-stdin variant doesn't apply here.
        try run(
            executable: executable, arguments: arguments,
            standardInput: Pipe(), stdinData: stdin,
            onBytes: onBytes, onExit: onExit
        )
    }

    private func run(
        executable: URL,
        arguments: [String],
        standardInput: Any,
        stdinData: Data?,
        onBytes: @escaping @Sendable (Data) -> Void,
        onExit:  @escaping @Sendable (Int32) -> Void
    ) throws {
        let pipe = Pipe()
        let process = Process()
        process.executableURL = executable
        process.arguments = arguments
        process.standardOutput = pipe
        process.standardError  = pipe
        process.standardInput  = standardInput
        process.environment = ProcessInfo.processInfo.environment

        pipe.fileHandleForReading.readabilityHandler = { handle in
            let bytes = handle.availableData
            if !bytes.isEmpty { onBytes(bytes) }
        }
        process.terminationHandler = { proc in
            onExit(proc.terminationStatus)
        }

        lock.lock()
        self.pipe = pipe
        self.process = process
        lock.unlock()

        try process.run()

        // Feed stdin off the calling thread — a payload past the
        // 64 KB pipe buffer would otherwise block here until the
        // child drains it. Closing the handle delivers EOF.
        if let stdinData, let stdinPipe = standardInput as? Pipe {
            DispatchQueue.global(qos: .userInitiated).async {
                let handle = stdinPipe.fileHandleForWriting
                try? handle.write(contentsOf: stdinData)
                try? handle.close()
            }
        }
    }

    func terminate() {
        lock.lock()
        let proc = self.process
        let pipe = self.pipe
        lock.unlock()
        if let proc, proc.isRunning { proc.terminate() }
        pipe?.fileHandleForReading.readabilityHandler = nil
        try? pipe?.fileHandleForReading.close()
        try? pipe?.fileHandleForWriting.close()
    }
}
