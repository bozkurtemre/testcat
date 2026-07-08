#import "SimCamSharedFrameReader.h"
#import <sys/mman.h>
#import <fcntl.h>
#import <unistd.h>

const uint32_t kSimCamFlagFillGravity = 1u << 0;
const uint32_t kSimCamFlagMirror      = 1u << 1;

static const size_t kHeaderSize = 24;
static const size_t kMaxCanvas = 1280;
static const size_t kBufferSize = kHeaderSize + kMaxCanvas * kMaxCanvas * 4;

@implementation SimCamSharedFrameReader {
    NSString *_path;
    int _fd;
    void *_buffer;
    uint32_t _lastSequence;
    uint32_t _latestFlags;
}

- (instancetype)initWithPath:(NSString *)path {
    if ((self = [super init])) {
        _path = [path copy];
        _fd = -1;
        _buffer = NULL;
        _lastSequence = 0;
        _latestFlags = 0;
    }
    return self;
}

- (uint32_t)latestFlags { return _latestFlags; }

- (void)dealloc {
    if (_buffer != NULL) {
        munmap(_buffer, kBufferSize);
        _buffer = NULL;
    }
    if (_fd >= 0) {
        close(_fd);
        _fd = -1;
    }
}

- (BOOL)openIfNeeded {
    if (_buffer != NULL) return YES;
    int fd = open([_path UTF8String], O_RDONLY);
    if (fd < 0) return NO;
    void *map = mmap(NULL, kBufferSize, PROT_READ, MAP_SHARED, fd, 0);
    if (map == MAP_FAILED) {
        close(fd);
        return NO;
    }
    _fd = fd;
    _buffer = map;
    return YES;
}

- (UIImage *)latestImage {
    if (![self openIfNeeded]) return nil;

    uint32_t sequence;
    uint32_t width;
    uint32_t height;
    uint32_t flags;
    memcpy(&sequence, _buffer, 4);
    memcpy(&width,  (uint8_t *)_buffer + 8,  4);
    memcpy(&height, (uint8_t *)_buffer + 12, 4);
    memcpy(&flags,  (uint8_t *)_buffer + 16, 4);
    _latestFlags = flags;

    if (sequence == 0 || sequence == _lastSequence) return nil;
    if (width == 0 || height == 0 || width > kMaxCanvas || height > kMaxCanvas) return nil;

    _lastSequence = sequence;

    size_t bytesPerRow = width * 4;
    size_t pixelBytes = (size_t)height * bytesPerRow;

    // Copy the pixels — captured stills must outlive the mmap window, and
    // a copy avoids tearing if SimCam Mac writes the next frame mid-render.
    NSData *data = [NSData dataWithBytes:(uint8_t *)_buffer + kHeaderSize
                                  length:pixelBytes];

    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGDataProviderRef provider = CGDataProviderCreateWithCFData((__bridge CFDataRef)data);
    CGImageRef cgImage = CGImageCreate(
        width, height,
        8, 32, bytesPerRow,
        colorSpace,
        kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst,
        provider, NULL, NO, kCGRenderingIntentDefault
    );
    UIImage *image = nil;
    if (cgImage != NULL) {
        image = [UIImage imageWithCGImage:cgImage];
        CGImageRelease(cgImage);
    }
    CGDataProviderRelease(provider);
    CGColorSpaceRelease(colorSpace);
    return image;
}

@end
