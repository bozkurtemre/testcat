import Foundation
import Mockable

/// The host's collection of simulators — a true DDD repository.
/// Lists what's available and finds by UDID; capability factories
/// (`screen`, `input`, `orientation`, …) live on `Simulator` itself.
///
/// `@Mockable` so domain tests can drive the aggregate without
/// CoreSimulator. Class-bound (`AnyObject`) because the production
/// impl `CoreSimulators` is reference-typed.
@Mockable
protocol Simulators: AnyObject, Sendable {
    var all: [any Simulator] { get }
    func find(udid: String) -> (any Simulator)?
}

extension Simulators {
    /// Booted simulators — the RUNNING section of the serve UI.
    var running: [any Simulator] {
        all.filter { $0.state == .booted }.sorted(by: prefersForAgentSelection)
    }

    /// Everything that isn't booted (shutdown, booting, shutting
    /// down) — the AVAILABLE section. Booting devices land here so
    /// the user has somewhere to see them while they come up.
    var available: [any Simulator] {
        all.filter { $0.state != .booted }.sorted(by: prefersForAgentSelection)
    }

    /// JSON projection consumed by the `/simulators.json` endpoint.
    /// Sorted keys keep diffs and snapshot tests readable; the
    /// section split mirrors the page's RUNNING / AVAILABLE layout.
    var listJSON: String {
        let dict: [String: Any] = [
            "running":   running.map(\.dictionary),
            "available": available.map(\.dictionary),
        ]
        let data = try! JSONSerialization.data(
            withJSONObject: dict, options: [.sortedKeys]
        )
        return String(decoding: data, as: UTF8.self)
    }
}

private extension Simulator {
    var dictionary: [String: Any] {
        ["udid": udid, "name": name, "state": state.description, "runtime": runtime]
    }
}

private func prefersForAgentSelection(_ lhs: any Simulator, _ rhs: any Simulator) -> Bool {
    let left = preference(lhs)
    let right = preference(rhs)

    if left.isPhone != right.isPhone { return left.isPhone > right.isPhone }
    if left.runtimeMajor != right.runtimeMajor { return left.runtimeMajor > right.runtimeMajor }
    if left.runtimeMinor != right.runtimeMinor { return left.runtimeMinor > right.runtimeMinor }
    if left.modelNumber != right.modelNumber { return left.modelNumber > right.modelNumber }
    if left.variantRank != right.variantRank { return left.variantRank > right.variantRank }
    if lhs.name != rhs.name { return lhs.name < rhs.name }
    return lhs.udid < rhs.udid
}

private func preference(_ simulator: any Simulator) -> (
    isPhone: Int,
    runtimeMajor: Int,
    runtimeMinor: Int,
    modelNumber: Int,
    variantRank: Int
) {
    (
        isPhone: simulator.name.hasPrefix("iPhone") ? 1 : 0,
        runtimeMajor: runtimeVersion(simulator.runtime).major,
        runtimeMinor: runtimeVersion(simulator.runtime).minor,
        modelNumber: iPhoneModelNumber(simulator.name),
        variantRank: iPhoneVariantRank(simulator.name)
    )
}

private func runtimeVersion(_ runtime: String) -> (major: Int, minor: Int) {
    let pattern = #"(\d+)(?:\.(\d+))?"#
    guard
        let match = runtime.range(of: pattern, options: .regularExpression)
    else { return (0, 0) }

    let parts = runtime[match].split(separator: ".", maxSplits: 1)
    let major = Int(parts.first ?? "") ?? 0
    let minor = parts.count > 1 ? (Int(parts[1]) ?? 0) : 0
    return (major, minor)
}

private func iPhoneModelNumber(_ name: String) -> Int {
    let pattern = #"iPhone\s+(\d+)"#
    guard
        let match = name.range(of: pattern, options: .regularExpression)
    else { return name.hasPrefix("iPhone") ? 0 : -1 }

    let matched = String(name[match])
    return Int(matched.components(separatedBy: .whitespaces).last ?? "") ?? 0
}

private func iPhoneVariantRank(_ name: String) -> Int {
    if name.contains("Pro Max") { return 4 }
    if name.contains("Pro") { return 3 }
    if name.contains("Plus") { return 2 }
    if name.contains("Air") { return 1 }
    if name.hasPrefix("iPhone") { return 0 }
    return -1
}
