#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// Owns a `CADisplayLink` that pumps Mac webcam frames into a CALayer's
/// `contents` at display refresh rate. Attached as an associated object to
/// each `AVCaptureVideoPreviewLayer` we observe — so the lifetime of the
/// driver matches the layer's, and the display link auto-stops on dealloc.
@interface SimCamPreviewLayerDriver : NSObject

- (instancetype)initWithLayer:(CALayer *)layer NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

@end

NS_ASSUME_NONNULL_END
