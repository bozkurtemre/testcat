import ArgumentParser
import Foundation

/// `testcat-sim clipboard <get|sync|copy> --udid <UDID>`
///
/// The simulator's pasteboard as a resource: `get` prints its text
/// contents; `sync` copies the host Mac's pasteboard onto the
/// simulator full-fidelity — every representation, images included —
/// which is the path for pasting non-text content; `copy` is its
/// mirror, copying the simulator's pasteboard onto the host Mac's
/// clipboard (again full-fidelity), the path for pulling what the
/// simulator copied back onto the Mac. Backed by
/// `xcrun simctl pbpaste | pbsync`; to *put text on* the pasteboard
/// use `testcat-sim paste` (optionally `--no-press`).
struct ClipboardCommand: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "clipboard",
        abstract: "Read the simulator's pasteboard, or sync it to/from the host",
        subcommands: [Get.self, Sync.self, Copy.self]
    )

    /// `testcat-sim clipboard get --udid <UDID>`
    struct Get: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            commandName: "get",
            abstract: "Print the simulator's pasteboard text to stdout"
        )

        @OptionGroup var options: DeviceOption

        func run() async throws {
            let simulators = CoreSimulators(deviceSetPath: options.deviceSet)
            guard let simulator = simulators.find(udid: options.udid) else {
                log("Device \(options.udid) not found")
                throw ExitCode.failure
            }
            do {
                // Raw, no trailing newline — mirrors `pbpaste` so the
                // output pipes byte-faithfully.
                print(try await simulator.pasteboard().text(), terminator: "")
            } catch {
                log("clipboard get failed: \(error)")
                throw ExitCode.failure
            }
        }
    }

    /// `testcat-sim clipboard sync --udid <UDID>`
    struct Sync: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            commandName: "sync",
            abstract: "Copy the host Mac's pasteboard onto the simulator (images included)"
        )

        @OptionGroup var options: DeviceOption

        func run() async throws {
            let simulators = CoreSimulators(deviceSetPath: options.deviceSet)
            guard let simulator = simulators.find(udid: options.udid) else {
                log("Device \(options.udid) not found")
                throw ExitCode.failure
            }
            do {
                try await simulator.pasteboard().syncFromHost()
            } catch {
                log("clipboard sync failed: \(error)")
                throw ExitCode.failure
            }
            log("Synced host pasteboard onto \(simulator.name)")
        }
    }

    /// `testcat-sim clipboard copy --udid <UDID>`
    struct Copy: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            commandName: "copy",
            abstract: "Copy the simulator's pasteboard onto the host Mac (images included)"
        )

        @OptionGroup var options: DeviceOption

        func run() async throws {
            let simulators = CoreSimulators(deviceSetPath: options.deviceSet)
            guard let simulator = simulators.find(udid: options.udid) else {
                log("Device \(options.udid) not found")
                throw ExitCode.failure
            }
            do {
                try await simulator.pasteboard().syncToHost()
            } catch {
                log("clipboard copy failed: \(error)")
                throw ExitCode.failure
            }
            log("Copied \(simulator.name) pasteboard onto the host")
        }
    }
}
