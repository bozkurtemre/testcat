#!/bin/bash
set -e
cd "$(dirname "$0")"

# The camera dylib is vendored prebuilt under
# Sources/Baguette/Resources/VirtualCamera/. Rebuild it only if you change
# VirtualCamera/Sources: ./VirtualCamera/build.sh

# Pure-SPM build. Private frameworks resolve through the rpath flags +
# linkedFramework declarations in Package.swift.
swift build -c release

# Drop the binary at the package root for install scripts.
cp -f .build/release/testcat-sim ./testcat-sim
echo "Build complete: ./testcat-sim"
