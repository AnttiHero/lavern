// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LavernMenuBar",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "LavernMenuBar",
            path: "Sources"
        ),
    ]
)
