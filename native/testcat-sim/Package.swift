// swift-tools-version: 6.1

import PackageDescription

// Forked from tddworks/baguette (Apache-2.0). The web/serve layer (Hummingbird
// HTTP+WebSocket server, /farm, Resources/Web) was removed — testcat renders the
// live simulator grid itself by consuming `testcat-sim stream`. The executable
// is renamed to `testcat-sim`. See NOTICE for attribution + changes.
//
// SimulatorKit + CoreSimulator are deliberately NOT linked here — the code
// reaches them via NSClassFromString + dlsym after discovering the active Xcode
// through `xcode-select -p`, so the binary works regardless of Xcode location.
let package = Package(
    name: "TestcatSim",
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "testcat-sim", targets: ["Baguette"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.7.1"),
        .package(url: "https://github.com/Kolos65/Mockable", from: "0.4.0"),
    ],
    targets: [
        .executableTarget(
            name: "Baguette",
            dependencies: [
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
                .product(name: "Mockable", package: "Mockable"),
            ],
            path: "Sources/Baguette",
            resources: [
                // iOS-Simulator dylib for the camera feature (vendored prebuilt).
                .copy("Resources/VirtualCamera"),
            ],
            swiftSettings: [
                // MOCKING is debug-only; release strips mock code entirely.
                .define("MOCKING", .when(configuration: .debug)),
            ],
            linkerSettings: [
                .linkedFramework("IOSurface"),
                .linkedFramework("CoreGraphics"),
                .linkedFramework("CoreVideo"),
                .linkedFramework("ImageIO"),
                .linkedFramework("VideoToolbox"),
            ]
        ),
    ]
)
