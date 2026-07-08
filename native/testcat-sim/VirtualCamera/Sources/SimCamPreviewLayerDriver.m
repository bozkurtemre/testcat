#import "SimCamPreviewLayerDriver.h"
#import "SimCamSharedFrameReader.h"
#import <QuartzCore/QuartzCore.h>

static NSString * const kSimCamSharedPath = @"/tmp/SimCam.bgra";
static const CFTimeInterval kStaleAfter = 1.0;  // seconds

@interface SimCamPreviewLayerDriver ()
@property (nonatomic, weak) CALayer *layer;
@property (nonatomic, strong) SimCamSharedFrameReader *reader;
@property (nonatomic, strong, nullable) CADisplayLink *displayLink;
@property (nonatomic, assign) CFTimeInterval lastFreshFrameTime;
@property (nonatomic, assign) BOOL showingPlaceholder;
@property (nonatomic, strong, nullable) UIImage *cachedPlaceholder;
@end

@implementation SimCamPreviewLayerDriver

- (instancetype)initWithLayer:(CALayer *)layer {
    if ((self = [super init])) {
        _layer = layer;
        _reader = [[SimCamSharedFrameReader alloc] initWithPath:kSimCamSharedPath];
        _lastFreshFrameTime = 0;
        _showingPlaceholder = NO;
        _displayLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(tick)];
        [_displayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
    }
    return self;
}

- (void)dealloc {
    [_displayLink invalidate];
    _displayLink = nil;
}

- (void)tick {
    CALayer *layer = self.layer;
    if (layer == nil) {
        [self.displayLink invalidate];
        self.displayLink = nil;
        return;
    }

    UIImage *image = [self.reader latestImage];
    if (image != nil) {
        self.lastFreshFrameTime = CACurrentMediaTime();
        self.showingPlaceholder = NO;
        layer.contents = (__bridge id)image.CGImage;
        // Black background so the aspect-fit letterbox bands are black,
        // not whatever default gray the underlying CAM* view uses.
        layer.backgroundColor = [UIColor blackColor].CGColor;

        // Per-frame display preferences come through the shared-buffer
        // header (set by the Mac HUD). Default is Fit + no mirror, which
        // matches a native camera app's "what you see is what you save"
        // contract; the user can flip these in the HUD without restart.
        uint32_t flags = self.reader.latestFlags;
        layer.contentsGravity = (flags & kSimCamFlagFillGravity)
            ? kCAGravityResizeAspectFill
            : kCAGravityResizeAspect;
        layer.affineTransform = (flags & kSimCamFlagMirror)
            ? CGAffineTransformMakeScale(-1, 1)
            : CGAffineTransformIdentity;
        return;
    }

    // No new frame this tick — decide whether to show the placeholder.
    CFTimeInterval staleness = (self.lastFreshFrameTime == 0)
        ? kStaleAfter + 1
        : CACurrentMediaTime() - self.lastFreshFrameTime;
    if (staleness > kStaleAfter && !self.showingPlaceholder) {
        UIImage *placeholder = [self placeholderImage];
        if (placeholder != nil) {
            layer.contents = (__bridge id)placeholder.CGImage;
            layer.contentsGravity = kCAGravityResizeAspect;
            self.showingPlaceholder = YES;
        }
    }
}

- (UIImage *)placeholderImage {
    if (self.cachedPlaceholder != nil) return self.cachedPlaceholder;

    CGSize size = CGSizeMake(900, 600);
    UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:size];
    UIImage *image = [renderer imageWithActions:^(UIGraphicsImageRendererContext *ctx) {
        // Dark background.
        [[UIColor colorWithWhite:0.07 alpha:1.0] setFill];
        UIRectFill(CGRectMake(0, 0, size.width, size.height));

        // Centered title + subtitle.
        NSString *title = @"No camera signal";
        NSString *subtitle = @"Start SimCam from the menu bar to see your Mac camera here.";

        UIFont *titleFont = [UIFont systemFontOfSize:46 weight:UIFontWeightSemibold];
        UIFont *subtitleFont = [UIFont systemFontOfSize:24 weight:UIFontWeightRegular];

        NSDictionary *titleAttrs = @{
            NSFontAttributeName: titleFont,
            NSForegroundColorAttributeName: [UIColor colorWithWhite:0.92 alpha:1.0],
        };
        NSDictionary *subtitleAttrs = @{
            NSFontAttributeName: subtitleFont,
            NSForegroundColorAttributeName: [UIColor colorWithWhite:0.55 alpha:1.0],
        };

        CGSize titleSize = [title sizeWithAttributes:titleAttrs];
        CGSize subtitleSize = [subtitle sizeWithAttributes:subtitleAttrs];

        CGFloat totalH = titleSize.height + 16 + subtitleSize.height;
        CGFloat startY = (size.height - totalH) / 2.0;

        [title drawAtPoint:CGPointMake((size.width - titleSize.width) / 2.0, startY)
            withAttributes:titleAttrs];
        [subtitle drawAtPoint:CGPointMake((size.width - subtitleSize.width) / 2.0,
                                          startY + titleSize.height + 16)
               withAttributes:subtitleAttrs];
    }];

    self.cachedPlaceholder = image;
    return image;
}

@end
