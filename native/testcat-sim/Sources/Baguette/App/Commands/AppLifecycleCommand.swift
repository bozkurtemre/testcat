import ArgumentParser
import Foundation

struct InstallCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "install",
        abstract: "Install a simulator .app bundle headlessly"
    )

    @OptionGroup var options: DeviceOption

    @Option(name: .long, help: "Path to a simulator-built .app bundle")
    var app: String

    func run() async throws {
        let appURL = try resolveAppBundle(app)
        let bundleId = try readBundleIdentifier(appURL)
        try runSimctl(
            deviceSet: options.deviceSet,
            ["install", options.udid, appURL.path]
        )
        try printJSON(AppLifecycleResult(
            ok: true,
            udid: options.udid,
            app: appURL.path,
            bundleId: bundleId,
            stdout: nil,
            stderr: nil
        ))
    }
}

struct LaunchAppCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "launch",
        abstract: "Launch an installed app on a simulator"
    )

    @OptionGroup var options: DeviceOption

    @Option(name: .long, help: "Path to a simulator-built .app bundle; bundle id is read from Info.plist")
    var app: String?

    @Option(name: .customLong("bundle-id"), help: "Bundle identifier to launch")
    var bundleId: String?

    @Flag(name: .customLong("terminate-running-process"), help: "Ask simctl to terminate an existing app process before launching")
    var terminateRunningProcess = false

    @Argument(help: "Arguments passed to the launched app")
    var appArguments: [String] = []

    func run() async throws {
        let target = try resolveTarget(app: app, bundleId: bundleId)
        var args = ["launch"]
        if terminateRunningProcess {
            args.append("--terminate-running-process")
        }
        args.append(contentsOf: [options.udid, target.bundleId])
        args.append(contentsOf: appArguments)

        let proxyEnv = try configureSimulatorProxyForLaunch(
            deviceSet: options.deviceSet,
            udid: options.udid
        )
        defer {
            if let proxyEnv {
                do {
                    try restoreSimulatorProxyEnv(deviceSet: options.deviceSet, proxyEnv)
                } catch {
                    fputs("warning: failed to restore simulator proxy environment: \(error)\n", stderr)
                }
            }
        }

        let output = try runSimctl(deviceSet: options.deviceSet, args)
        try printJSON(AppLifecycleResult(
            ok: true,
            udid: options.udid,
            app: target.app?.path,
            bundleId: target.bundleId,
            stdout: output.stdout.nilIfEmpty,
            stderr: output.stderr.nilIfEmpty
        ))
    }
}

struct TerminateAppCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "terminate",
        abstract: "Terminate a running simulator app"
    )

    @OptionGroup var options: DeviceOption

    @Option(name: .long, help: "Path to a simulator-built .app bundle; bundle id is read from Info.plist")
    var app: String?

    @Option(name: .customLong("bundle-id"), help: "Bundle identifier to terminate")
    var bundleId: String?

    func run() async throws {
        let target = try resolveTarget(app: app, bundleId: bundleId)
        let output = try runSimctl(
            deviceSet: options.deviceSet,
            ["terminate", options.udid, target.bundleId]
        )
        try printJSON(AppLifecycleResult(
            ok: true,
            udid: options.udid,
            app: target.app?.path,
            bundleId: target.bundleId,
            stdout: output.stdout.nilIfEmpty,
            stderr: output.stderr.nilIfEmpty
        ))
    }
}

struct UninstallCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "uninstall",
        abstract: "Uninstall an app from a simulator"
    )

    @OptionGroup var options: DeviceOption

    @Option(name: .long, help: "Path to a simulator-built .app bundle; bundle id is read from Info.plist")
    var app: String?

    @Option(name: .customLong("bundle-id"), help: "Bundle identifier to uninstall")
    var bundleId: String?

    func run() async throws {
        let target = try resolveTarget(app: app, bundleId: bundleId)
        let output = try runSimctl(
            deviceSet: options.deviceSet,
            ["uninstall", options.udid, target.bundleId]
        )
        try printJSON(AppLifecycleResult(
            ok: true,
            udid: options.udid,
            app: target.app?.path,
            bundleId: target.bundleId,
            stdout: output.stdout.nilIfEmpty,
            stderr: output.stderr.nilIfEmpty
        ))
    }
}

private struct AppTarget {
    let app: URL?
    let bundleId: String
}

private struct SimctlOutput {
    let stdout: String
    let stderr: String
}

private struct SimulatorProxyEnv {
    let udid: String
    let previous: [String: String?]
}

private struct AppLifecycleResult: Encodable {
    let ok: Bool
    let udid: String
    let app: String?
    let bundleId: String
    let stdout: String?
    let stderr: String?
}

private enum AppLifecycleError: Error, CustomStringConvertible {
    case appNotFound(String)
    case notAppBundle(String)
    case missingInfoPlist(String)
    case missingBundleIdentifier(String)
    case missingTarget
    case duplicateTarget
    case simctlFailed(command: String, status: Int32, stdout: String, stderr: String)

    var description: String {
        switch self {
        case .appNotFound(let path):
            return "app bundle not found: \(path)"
        case .notAppBundle(let path):
            return "path is not a .app bundle: \(path)"
        case .missingInfoPlist(let path):
            return "Info.plist not found in app bundle: \(path)"
        case .missingBundleIdentifier(let path):
            return "CFBundleIdentifier not found in \(path)"
        case .missingTarget:
            return "set exactly one of --app or --bundle-id"
        case .duplicateTarget:
            return "set only one of --app or --bundle-id"
        case .simctlFailed(let command, let status, let stdout, let stderr):
            let detail = [stderr, stdout].filter { !$0.isEmpty }.joined(separator: "\n")
            return "\(command) failed with status \(status)\(detail.isEmpty ? "" : ": \(detail)")"
        }
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}

private func resolveTarget(app: String?, bundleId: String?) throws -> AppTarget {
    switch (app?.trimmingCharacters(in: .whitespacesAndNewlines), bundleId?.trimmingCharacters(in: .whitespacesAndNewlines)) {
    case let (app?, nil) where !app.isEmpty:
        let url = try resolveAppBundle(app)
        return AppTarget(app: url, bundleId: try readBundleIdentifier(url))
    case let (nil, bundleId?) where !bundleId.isEmpty:
        return AppTarget(app: nil, bundleId: bundleId)
    case let (app?, bundleId?) where !app.isEmpty && !bundleId.isEmpty:
        throw AppLifecycleError.duplicateTarget
    default:
        throw AppLifecycleError.missingTarget
    }
}

private func resolveAppBundle(_ path: String) throws -> URL {
    let url = URL(fileURLWithPath: path).standardizedFileURL
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
        throw AppLifecycleError.appNotFound(url.path)
    }
    guard isDirectory.boolValue && url.pathExtension == "app" else {
        throw AppLifecycleError.notAppBundle(url.path)
    }
    return url
}

private func readBundleIdentifier(_ appURL: URL) throws -> String {
    guard let infoURL = infoPlistURL(for: appURL) else {
        throw AppLifecycleError.missingInfoPlist(appURL.path)
    }
    let data = try Data(contentsOf: infoURL)
    guard
        let plist = try PropertyListSerialization.propertyList(from: data, options: [], format: nil) as? [String: Any],
        let bundleId = plist["CFBundleIdentifier"] as? String,
        !bundleId.isEmpty
    else {
        throw AppLifecycleError.missingBundleIdentifier(infoURL.path)
    }
    return bundleId
}

private func infoPlistURL(for appURL: URL) -> URL? {
    let candidates = [
        appURL.appendingPathComponent("Info.plist"),
        appURL.appendingPathComponent("Contents/Info.plist"),
    ]
    return candidates.first { FileManager.default.fileExists(atPath: $0.path) }
}

private func configureSimulatorProxyForLaunch(
    deviceSet: String?,
    udid: String
) throws -> SimulatorProxyEnv? {
    guard
        let proxyURL = ProcessInfo.processInfo.environment["TESTCAT_NETWORK_PROXY_URL"]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
        !proxyURL.isEmpty
    else {
        return nil
    }

    let values = [
        "http_proxy": proxyURL,
        "https_proxy": proxyURL,
        "HTTP_PROXY": proxyURL,
        "HTTPS_PROXY": proxyURL,
        "no_proxy": "127.0.0.1,localhost,::1",
        "NO_PROXY": "127.0.0.1,localhost,::1",
    ]
    var previous: [String: String?] = [:]
    for key in values.keys {
        previous[key] = readSimulatorEnv(deviceSet: deviceSet, udid: udid, key: key)
    }
    for (key, value) in values {
        try runSimctl(deviceSet: deviceSet, [
            "spawn",
            udid,
            "launchctl",
            "setenv",
            key,
            value,
        ])
    }
    return SimulatorProxyEnv(udid: udid, previous: previous)
}

private func restoreSimulatorProxyEnv(
    deviceSet: String?,
    _ proxyEnv: SimulatorProxyEnv
) throws {
    for (key, value) in proxyEnv.previous {
        if let value, !value.isEmpty {
            try runSimctl(deviceSet: deviceSet, [
                "spawn",
                proxyEnv.udid,
                "launchctl",
                "setenv",
                key,
                value,
            ])
        } else {
            try runSimctl(deviceSet: deviceSet, [
                "spawn",
                proxyEnv.udid,
                "launchctl",
                "unsetenv",
                key,
            ])
        }
    }
}

private func readSimulatorEnv(deviceSet: String?, udid: String, key: String) -> String? {
    guard
        let output = try? runSimctl(deviceSet: deviceSet, ["getenv", udid, key])
            .stdout
            .trimmingCharacters(in: .whitespacesAndNewlines),
        !output.isEmpty
    else {
        return nil
    }
    return output
}

@discardableResult
private func runSimctl(deviceSet: String?, _ command: [String]) throws -> SimctlOutput {
    var args = ["simctl"]
    if let deviceSet, !deviceSet.isEmpty {
        args.append(contentsOf: ["--set", deviceSet])
    }
    args.append(contentsOf: command)

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/xcrun")
    process.arguments = args

    let stdout = Pipe()
    let stderr = Pipe()
    process.standardOutput = stdout
    process.standardError = stderr

    try process.run()
    process.waitUntilExit()

    let out = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let err = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

    guard process.terminationStatus == 0 else {
        throw AppLifecycleError.simctlFailed(
            command: (["xcrun"] + args).joined(separator: " "),
            status: process.terminationStatus,
            stdout: out,
            stderr: err
        )
    }
    return SimctlOutput(stdout: out, stderr: err)
}

private func printJSON<T: Encodable>(_ value: T) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = try encoder.encode(value)
    try FileHandle.standardOutput.write(contentsOf: data)
    try FileHandle.standardOutput.write(contentsOf: Data("\n".utf8))
}
