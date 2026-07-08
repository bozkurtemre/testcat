import type { Readable } from 'node:stream';
import { StdioOptions } from 'node:child_process';
import type { Writable } from 'node:stream';

export declare const ANDROID_SNAPSHOT_HELPER_NAME = "android-snapshot-helper";

export declare const ANDROID_SNAPSHOT_HELPER_OUTPUT_FORMAT = "uiautomator-xml";

export declare const ANDROID_SNAPSHOT_HELPER_PACKAGE = "com.callstack.agentdevice.snapshothelper";

export declare const ANDROID_SNAPSHOT_HELPER_PROTOCOL = "android-snapshot-helper-v1";

export declare const ANDROID_SNAPSHOT_HELPER_RUNNER = "com.callstack.agentdevice.snapshothelper/.SnapshotInstrumentation";

export declare const ANDROID_SNAPSHOT_HELPER_WAIT_FOR_IDLE_TIMEOUT_MS = 500;

/**
 * Runs device-scoped adb arguments after the device serial has already been selected.
 * Implementations must be safe to call concurrently for one request.
 */
export declare type AndroidAdbExecutor = (args: string[], options?: AndroidAdbExecutorOptions) => Promise<AndroidAdbExecutorResult>;

declare type AndroidAdbExecutorOptions = Pick<ExecOptions, 'allowFailure' | 'timeoutMs' | 'binaryStdout' | 'stdin' | 'signal'>;

declare type AndroidAdbExecutorResult = Pick<ExecResult, 'exitCode' | 'stdout' | 'stderr' | 'stdoutBuffer'>;

/**
 * Installs an APK path. Implementations are responsible for honoring semantic
 * install options such as replace/test/downgrade/grant-permissions.
 */
declare type AndroidAdbInstaller = (apkPath: string, options?: AndroidAdbInstallOptions) => Promise<AndroidAdbExecutorResult>;

declare type AndroidAdbInstallOptions = AndroidAdbTransferOptions & {
    replace?: boolean;
    allowTestPackages?: boolean;
    allowDowngrade?: boolean;
    grantPermissions?: boolean;
};

declare type AndroidAdbProcess = {
    pid?: number;
    stdin: Writable | null;
    stdout: Readable | null;
    stderr: Readable | null;
    killed: boolean;
    kill(signal?: NodeJS.Signals | number): boolean;
    once(event: 'exit' | 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
    on(event: 'error', listener: (error: Error) => void): unknown;
    on(event: 'exit' | 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
};

declare type AndroidAdbProvider = {
    /**
     * Fallback executor for device-scoped adb arguments. Providers may omit explicit
     * methods to keep the legacy exec-shaped pull/install fallback.
     */
    exec: AndroidAdbExecutor;
    spawn?: AndroidAdbSpawner;
    reverse?: AndroidPortReverseProvider;
    pull?: AndroidAdbPuller;
    install?: AndroidAdbInstaller;
    installBundle?: AndroidBundleInstaller;
    text?: AndroidTextInjector;
    touch?: AndroidTouchInjector;
};

declare type AndroidAdbPuller = (remotePath: string, localPath: string, options?: AndroidAdbTransferOptions) => Promise<AndroidAdbExecutorResult>;

declare type AndroidAdbSpawner = (args: string[], options?: ExecBackgroundOptions) => AndroidAdbProcess;

declare type AndroidAdbTransferOptions = AndroidAdbExecutorOptions;

declare type AndroidBundleInstaller = (bundlePath: string, options: {
    mode: string;
}) => Promise<void>;

declare type AndroidPortReverseEndpoint = `tcp:${number}` | `localabstract:${string}`;

declare type AndroidPortReverseMapping = {
    local: AndroidPortReverseEndpoint;
    remote: AndroidPortReverseEndpoint;
    ownerId?: string;
};

declare type AndroidPortReverseOptions = {
    signal?: AbortSignal;
    timeoutMs?: number;
};

declare type AndroidPortReverseProvider = {
    ensure(mapping: AndroidPortReverseMapping, options?: AndroidPortReverseOptions): Promise<void>;
    remove(local: AndroidPortReverseEndpoint, options?: AndroidPortReverseOptions): Promise<void>;
    removeAllOwned(ownerId: string, options?: AndroidPortReverseOptions): Promise<void>;
    list?(options?: AndroidPortReverseOptions): Promise<AndroidPortReverseMapping[]>;
};

declare type AndroidSnapshotAnalysis = {
    rawNodeCount: number;
    maxDepth: number;
};

export declare type AndroidSnapshotBackendMetadata = {
    backend: 'android-helper' | 'uiautomator-dump';
    helperVersion?: string;
    helperApiVersion?: string;
    helperTransport?: AndroidSnapshotHelperTransport;
    helperSessionReused?: boolean;
    fallbackReason?: string;
    installReason?: AndroidSnapshotHelperInstallReason;
    waitForIdleTimeoutMs?: number;
    waitForIdleQuietMs?: number;
    timeoutMs?: number;
    maxDepth?: number;
    maxNodes?: number;
    rootPresent?: boolean;
    captureMode?: AndroidSnapshotCaptureMode;
    windowCount?: number;
    nodeCount?: number;
    helperTruncated?: boolean;
    elapsedMs?: number;
};

declare type AndroidSnapshotCaptureMode = 'interactive-windows' | 'active-window';

export declare type AndroidSnapshotHelperArtifact = {
    apkPath: string;
    manifest: AndroidSnapshotHelperManifest;
};

export declare type AndroidSnapshotHelperCaptureOptions = {
    adb: AndroidAdbExecutor;
    adbProvider?: AndroidAdbProvider;
    deviceKey?: string;
    helperVersion?: string;
    helperVersionCode?: number;
    packageName?: string;
    instrumentationRunner?: string;
    waitForIdleTimeoutMs?: number;
    waitForIdleQuietMs?: number;
    timeoutMs?: number;
    commandTimeoutMs?: number;
    maxDepth?: number;
    maxNodes?: number;
    outputPath?: string;
    emitChunks?: boolean;
};

export declare type AndroidSnapshotHelperInstallPolicy = 'missing-or-outdated' | 'always' | 'never';

declare type AndroidSnapshotHelperInstallReason = 'missing' | 'outdated' | 'forced' | 'current' | 'skipped';

export declare type AndroidSnapshotHelperInstallResult = {
    packageName: string;
    versionCode: number;
    installedVersionCode?: number;
    installed: boolean;
    reason: AndroidSnapshotHelperInstallReason;
};

export declare type AndroidSnapshotHelperManifest = {
    name: 'android-snapshot-helper';
    version: string;
    releaseTag?: string;
    assetName?: string;
    apkUrl: string | null;
    sha256: string;
    checksumName?: string;
    packageName: string;
    versionCode: number;
    instrumentationRunner: string;
    minSdk: number;
    targetSdk?: number;
    outputFormat: 'uiautomator-xml';
    statusProtocol: 'android-snapshot-helper-v1';
    installArgs: string[];
};

export declare type AndroidSnapshotHelperMetadata = {
    helperApiVersion?: string;
    outputFormat: 'uiautomator-xml';
    waitForIdleTimeoutMs?: number;
    waitForIdleQuietMs?: number;
    timeoutMs?: number;
    maxDepth?: number;
    maxNodes?: number;
    rootPresent?: boolean;
    captureMode?: AndroidSnapshotCaptureMode;
    windowCount?: number;
    nodeCount?: number;
    truncated?: boolean;
    elapsedMs?: number;
    transport?: AndroidSnapshotHelperTransport;
    sessionReused?: boolean;
};

export declare type AndroidSnapshotHelperOutput = {
    xml: string;
    metadata: AndroidSnapshotHelperMetadata;
};

export declare type AndroidSnapshotHelperParsedSnapshot = {
    nodes: RawSnapshotNode[];
    truncated?: boolean;
    analysis: AndroidSnapshotAnalysis;
    metadata: AndroidSnapshotHelperMetadata;
};

export declare type AndroidSnapshotHelperPreparedArtifact = AndroidSnapshotHelperArtifact & {
    cleanup?: () => Promise<void>;
};

declare type AndroidSnapshotHelperTransport = 'instrumentation' | 'persistent-session';

declare type AndroidTextInjectionRequest = {
    action: AndroidTextInputAction;
    text: string;
    delayMs?: number;
    /**
     * Present only for fill. Providers must make this target the focused/replaced
     * input for the request, not inject into an unrelated currently focused field.
     */
    target?: {
        x: number;
        y: number;
    };
};

declare type AndroidTextInjector = (request: AndroidTextInjectionRequest) => Promise<void>;

declare type AndroidTextInputAction = 'type' | 'fill';

declare type AndroidTouchGestureRequest = {
    kind: 'swipe';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    durationMs?: number;
} | {
    kind: 'pinch';
    x: number;
    y: number;
    scale: number;
    durationMs?: number;
} | {
    kind: 'rotate';
    x: number;
    y: number;
    degrees: number;
    durationMs?: number;
} | {
    kind: 'transform';
    x: number;
    y: number;
    dx: number;
    dy: number;
    scale: number;
    degrees: number;
    durationMs?: number;
};

declare type AndroidTouchInjector = (request: AndroidTouchGestureRequest) => Promise<Record<string, unknown> | void>;

export declare function captureAndroidSnapshotWithHelper(options: AndroidSnapshotHelperCaptureOptions): Promise<AndroidSnapshotHelperOutput>;

export declare function ensureAndroidSnapshotHelper(options: {
    adb: AndroidAdbExecutor;
    adbProvider?: AndroidAdbProvider | AndroidAdbExecutor;
    artifact: AndroidSnapshotHelperArtifact;
    deviceKey?: string;
    installPolicy?: AndroidSnapshotHelperInstallPolicy;
    timeoutMs?: number;
}): Promise<AndroidSnapshotHelperInstallResult>;

declare type ExecBackgroundOptions = ExecOptions & {
    /**
     * Capture stdout/stderr into the wait result when the child has piped stdio.
     * Set false when the caller owns, ignores, or forwards the streams.
     */
    captureOutput?: boolean;
    stdio?: StdioOptions;
};

declare type ExecOptions = {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    allowFailure?: boolean;
    binaryStdout?: boolean;
    stdin?: string | Buffer;
    timeoutMs?: number;
    detached?: boolean;
    signal?: AbortSignal;
    /** Max stdout/stderr bytes for synchronous runs (default Node ~1MB). */
    maxBuffer?: number;
};

declare type ExecResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
    stdoutBuffer?: Buffer;
};

export declare function parseAndroidSnapshotHelperManifest(value: unknown): AndroidSnapshotHelperManifest;

export declare function parseAndroidSnapshotHelperOutput(output: string): AndroidSnapshotHelperOutput;

export declare function parseAndroidSnapshotHelperXml(xml: string, metadata?: AndroidSnapshotHelperMetadata, options?: SnapshotOptions, maxNodes?: number): AndroidSnapshotHelperParsedSnapshot;

export declare function prepareAndroidSnapshotHelperArtifactFromManifestUrl(options: {
    manifestUrl: string;
    cacheDir?: string;
    fetch?: typeof fetch;
}): Promise<AndroidSnapshotHelperPreparedArtifact>;

declare type RawSnapshotNode = {
    index: number;
    type?: string;
    role?: string;
    subrole?: string;
    label?: string;
    value?: string;
    identifier?: string;
    rect?: Rect;
    enabled?: boolean;
    selected?: boolean;
    focused?: boolean;
    visibleToUser?: boolean;
    hittable?: boolean;
    depth?: number;
    parentIndex?: number;
    pid?: number;
    bundleId?: string;
    appName?: string;
    windowTitle?: string;
    surface?: string;
    hiddenContentAbove?: boolean;
    hiddenContentBelow?: boolean;
    interactionBlocked?: 'covered';
    presentationHints?: string[];
};

declare type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

declare type SnapshotOptions = {
    interactiveOnly?: boolean;
    depth?: number;
    scope?: string;
    raw?: boolean;
};

export declare function verifyAndroidSnapshotHelperArtifact(artifact: AndroidSnapshotHelperArtifact): Promise<void>;

export { }
