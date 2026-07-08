#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// Reads BGRA frames written by `SharedMemoryFrameSink` on the Mac side.
///
/// Header layout (24 bytes LE):
///   [0..<4]   sequence
///   [4..<8]   timestampMs
///   [8..<12]  width
///   [12..<16] height
///   [16..<20] flags        — bit 0 = fillGravity, bit 1 = mirror
///   [20..<24] reserved
///   [24..]    BGRA pixels, premultiplied-first, byteOrder32Little
///
/// `/tmp` in the simulator maps to `/private/tmp` on the host — that's how a
/// mmap'd file written by SimCam Mac becomes visible to apps in the sim.
@interface SimCamSharedFrameReader : NSObject

/// Display-preference flag bits (see `Flags` in `SharedFrameLayout.swift`).
/// `kSimCamFlagMirror` flips both the live preview and captured photo;
/// preview and capture must agree (WYSIWYG).
extern const uint32_t kSimCamFlagFillGravity;
extern const uint32_t kSimCamFlagMirror;

- (instancetype)initWithPath:(NSString *)path NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

/// Returns a fresh `UIImage` if a new frame has arrived since the last call.
/// Returns `nil` if the buffer is empty, the file is missing, or the sequence
/// has not advanced. As a side effect, updates `latestFlags` to the flags
/// recorded in that frame's header.
- (nullable UIImage *)latestImage;

/// Flags from the most recent header read (whether or not a fresh image
/// was returned). Defaults to 0 before any successful read.
@property (nonatomic, readonly) uint32_t latestFlags;

@end

NS_ASSUME_NONNULL_END
