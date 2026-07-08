import ArgumentParser
import Foundation

enum CompleteStatus: String, ExpressibleByArgument {
    case passed
    case failed
}

struct CompleteCommand: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "complete",
        abstract: "Emit the final testcat run completion marker"
    )

    @Option(name: .long, help: "Final test verdict: passed or failed")
    var status: CompleteStatus

    @Option(name: .long, help: "Short final summary for the run")
    var summary: String?

    @Option(name: .customLong("run-id"), help: "testcat run id; defaults to TESTCAT_RUN_ID")
    var runId: String?

    @Option(name: .long, help: "testcat completion token; defaults to TESTCAT_RUN_COMPLETE_TOKEN")
    var token: String?

    func run() throws {
        let env = ProcessInfo.processInfo.environment
        let resolvedRunId = runId?.nilIfBlank ?? env["TESTCAT_RUN_ID"]?.nilIfBlank
        let resolvedToken = token?.nilIfBlank ?? env["TESTCAT_RUN_COMPLETE_TOKEN"]?.nilIfBlank

        guard let resolvedRunId else {
            throw ValidationError("missing run id; pass --run-id or run under testcat")
        }
        guard let resolvedToken else {
            throw ValidationError("missing completion token; pass --token or run under testcat")
        }

        try printCompletionJSON(CompleteResult(
            ok: true,
            event: "testcat.run_complete",
            runId: resolvedRunId,
            token: resolvedToken,
            status: status.rawValue,
            summary: summary?.nilIfBlank
        ))
    }
}

private struct CompleteResult: Encodable {
    let ok: Bool
    let event: String
    let runId: String
    let token: String
    let status: String
    let summary: String?
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private func printCompletionJSON<T: Encodable>(_ value: T) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = try encoder.encode(value)
    try FileHandle.standardOutput.write(contentsOf: data)
    try FileHandle.standardOutput.write(contentsOf: Data("\n".utf8))
}
