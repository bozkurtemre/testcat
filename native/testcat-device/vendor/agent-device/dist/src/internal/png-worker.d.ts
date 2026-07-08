declare type PngWorkerJobResult = {
    kind: 'decode';
    width: number;
    height: number;
    data: Uint8Array;
} | {
    kind: 'encode';
    png: Uint8Array;
} | ({
    kind: 'diff-pixels';
} & ScreenshotDiffPixelsResult);

/**
 * Transfers result buffers instead of structured-cloning them, but only when a
 * view fully owns its ArrayBuffer. Exported for direct unit coverage; the
 * worker itself is the only runtime caller.
 */
export declare function resultTransferList(result: PngWorkerJobResult): ArrayBuffer[];

declare type ScreenshotDiffPixelsResult = {
    diffData: Buffer;
    diffMask: Uint8Array;
    differentPixels: number;
};

export { }
