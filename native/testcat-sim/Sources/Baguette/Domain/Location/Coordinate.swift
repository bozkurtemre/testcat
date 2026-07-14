import Foundation

/// A validated geographic point — the unit the location surface pins a
/// simulator to. Latitude is clamped to ±90, longitude to ±180; an
/// out-of-range pair fails the initializer rather than reaching simctl.
///
/// `argument` is the pure projection to the `"<lat>,<lon>"` token simctl
/// expects after `location <udid> set`. simctl mandates `.` as the
/// decimal separator and `,` as the field separator, so the projection
/// is built from Swift's locale-independent `Double` interpolation — it
/// never routes through a locale-aware formatter that could emit a
/// decimal comma.
public struct Coordinate: Equatable, Sendable {
    public var latitude: Double
    public var longitude: Double

    /// Fails when `latitude` is outside ±90 or `longitude` outside ±180.
    public init?(latitude: Double, longitude: Double) {
        guard (-90.0...90.0).contains(latitude),
              (-180.0...180.0).contains(longitude) else { return nil }
        self.latitude = latitude
        self.longitude = longitude
    }

    /// Parse a `"<lat>,<lon>"` token (the CLI's waypoint spelling, and
    /// the inverse of `argument`). Fails when the token isn't exactly two
    /// dot-decimal numbers or the pair is out of range.
    public init?(token: String) {
        let parts = token.split(separator: ",", omittingEmptySubsequences: false)
        guard parts.count == 2,
              let lat = Double(parts[0]),
              let lon = Double(parts[1]) else { return nil }
        self.init(latitude: lat, longitude: lon)
    }

    /// The `"<lat>,<lon>"` token simctl consumes — both as the `set`
    /// argument and as a waypoint inside a `start` route.
    public var argument: String { "\(latitude),\(longitude)" }

    /// JSON object matching the wire body the location route accepts and
    /// the browser panel posts. Numbers, not strings, so it round-trips
    /// through `JSONSerialization`.
    public var jsonString: String { "{\"latitude\":\(latitude),\"longitude\":\(longitude)}" }
}
