import ArgumentParser
import Foundation

/// `testcat-sim screencast --udid <UDID> [--fps N] [--quality N] [--scale N]`
///
/// Continuously streams the framebuffer to stdout as live MJPEG. Runs the
/// existing `MJPEGStream` (encoder + SeedFilter + envelope) but in an ASYNC
/// command context, where SimulatorKit's framebuffer callbacks are actually
/// delivered — unlike the `stream` command's `dispatchMain()`, whose callback
/// delivery depended on the web server's event loop (removed in this fork).
/// SeedFilter keeps an idle screen off the wire; activity streams at the
/// composite rate. testcat consumes this to paint its live, view-only grid.
struct ScreencastCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "screencast",
        abstract: "Continuously stream the framebuffer to stdout as live MJPEG"
    )

    @OptionGroup var options: DeviceOption

    @Option(help: "Target frames per second (upper bound)")
    var fps: Int = 30

    @Option(help: "JPEG quality (0.0 – 1.0)")
    var quality: Double = 0.6

    @Option(help: "Integer downscale divisor (1 = native)")
    var scale: Int = 2

    func run() async throws {
        let simulators = CoreSimulators(deviceSetPath: options.deviceSet)
        guard let simulator = simulators.find(udid: options.udid) else {
            log("Device \(options.udid) not found")
            throw ExitCode.failure
        }

        let stream = StreamFormat.mjpeg.makeStream(
            config: StreamConfig(
                fps: fps,
                bitrateBps: StreamConfig.default.bitrateBps,
                scale: max(1, scale)
            ),
            sink: StdoutSink(),
            quality: quality
        )
        try stream.start(on: simulator.screen())

        // Keep the process alive; frames flow from the screen callbacks.
        while !Task.isCancelled {
            try await Task.sleep(nanoseconds: 1_000_000_000)
        }
        stream.stop()
    }
}
