import ArgumentParser
import Foundation

/// `testcat-sim location <set|start|clear> --udid <UDID> …`
///
/// Drives the booted simulator's simulated GPS location — pin a single
/// point, run a moving route between waypoints, or clear back to the
/// device's live value. Backed by `xcrun simctl location` — a one-shot
/// subprocess, not the SimulatorHID gesture path. The value-domain
/// projection lives in `Domain/Location/`; the spawn is in
/// `Infrastructure/Location/SimctlLocation.swift`.
struct LocationCommand: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "location",
        abstract: "Set, route, or clear the booted simulator's simulated GPS location",
        subcommands: [Set.self, Start.self, Clear.self]
    )

    /// `testcat-sim location set --udid <UDID> <lat,lon>`
    ///
    /// The position is a single `lat,lon` token rather than two `--lat` /
    /// `--lon` flags: a western/southern coordinate begins with `-`, and
    /// ArgumentParser would read `-122.03` as an unknown option. The
    /// comma-joined token sidesteps that and stays symmetric with the
    /// `start` waypoints. For a position whose latitude itself starts
    /// with `-`, pass `--` first: `location set --udid U -- -37.6,144.9`.
    struct Set: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            commandName: "set",
            abstract: "Pin the simulator to a lat,lon position"
        )

        @OptionGroup var options: DeviceOption

        @Argument(help: "Position as a lat,lon token, e.g. 37.3318,-122.0312")
        var position: String

        /// The parsed token as a validated Domain value — `nil` when it's
        /// malformed or out of range. The single mapping `run()` and the
        /// parsing tests both exercise.
        var coordinate: Coordinate? {
            Coordinate(token: position)
        }

        func run() async throws {
            let simulators = CoreSimulators(deviceSetPath: options.deviceSet)
            guard let simulator = simulators.find(udid: options.udid) else {
                log("Device \(options.udid) not found")
                throw ExitCode.failure
            }
            guard let coordinate else {
                log("location set: latitude must be -90…90 and longitude -180…180")
                throw ExitCode.failure
            }
            do {
                try await simulator.location().set(coordinate)
            } catch {
                log("location set failed: \(error)")
                throw ExitCode.failure
            }
            log("Set \(simulator.name) location to \(coordinate.argument)")
        }
    }

    /// `testcat-sim location start --udid <UDID> [--speed …] [--distance …] [--interval …] <lat,lon> <lat,lon>…`
    struct Start: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            commandName: "start",
            abstract: "Run a moving route between two or more lat,lon waypoints"
        )

        @OptionGroup var options: DeviceOption

        @Option(help: "Speed in metres/second (default: simctl's 20)")
        var speed: Double?

        @Option(help: "Metres travelled between location updates")
        var distance: Double?

        @Option(help: "Seconds between location updates")
        var interval: Double?

        @Argument(help: "Waypoints as lat,lon tokens (two or more)")
        var waypoints: [String] = []

        /// The parsed waypoints + tuning as a validated route — `nil`
        /// when any token is malformed/out-of-range or fewer than two
        /// waypoints are given.
        var route: LocationRoute? {
            let coords = waypoints.compactMap(Coordinate.init(token:))
            guard coords.count == waypoints.count else { return nil }
            return LocationRoute(
                waypoints: coords, speed: speed, distance: distance, interval: interval
            )
        }

        func run() async throws {
            let simulators = CoreSimulators(deviceSetPath: options.deviceSet)
            guard let simulator = simulators.find(udid: options.udid) else {
                log("Device \(options.udid) not found")
                throw ExitCode.failure
            }
            guard let route else {
                log("location start: give two or more valid lat,lon waypoints")
                throw ExitCode.failure
            }
            do {
                try await simulator.location().start(route)
            } catch {
                log("location start failed: \(error)")
                throw ExitCode.failure
            }
            log("Started \(simulator.name) route over \(route.waypoints.count) waypoints")
        }
    }

    /// `testcat-sim location clear --udid <UDID>`
    struct Clear: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            commandName: "clear",
            abstract: "Clear the simulated location, restoring live values"
        )

        @OptionGroup var options: DeviceOption

        func run() async throws {
            let simulators = CoreSimulators(deviceSetPath: options.deviceSet)
            guard let simulator = simulators.find(udid: options.udid) else {
                log("Device \(options.udid) not found")
                throw ExitCode.failure
            }
            do {
                try await simulator.location().clear()
            } catch {
                log("location clear failed: \(error)")
                throw ExitCode.failure
            }
            log("Cleared \(simulator.name) simulated location")
        }
    }
}
