export declare type AppErrorCode = KnownAppErrorCode | (string & {});

export declare function centerOfRect(rect: Rect): Point;

export declare const DAEMON_LOCK_POLICIES: readonly ['reject', 'strip'];

export declare const DAEMON_SERVER_MODES: readonly ['socket', 'http', 'dual'];

export declare const DAEMON_TRANSPORT_PREFERENCES: readonly ['auto', 'socket', 'http'];

export declare type DaemonArtifact = {
    field: string;
    artifactId?: string;
    fileName?: string;
    localPath?: string;
    path?: string;
};

export declare const daemonCommandRequestSchema: RuntimeSchema<DaemonRequest>;

export declare type DaemonError = {
    code: string;
    message: string;
    hint?: string;
    diagnosticId?: string;
    logPath?: string;
    details?: Record<string, unknown>;
};

export declare type DaemonInstallSource = {
    kind: 'url';
    url: string;
    headers?: Record<string, string>;
} | {
    kind: 'path';
    path: string;
} | ({
    kind: 'github-actions-artifact';
    owner: string;
    repo: string;
} & ({
    artifactId: number;
} | {
    runId: number;
    artifactName: string;
} | {
    artifactName: string;
}));

export declare type DaemonLockPolicy = (typeof DAEMON_LOCK_POLICIES)[number];

export declare type DaemonRequest = {
    token?: string;
    session?: string;
    command: string;
    positionals: string[];
    flags?: Record<string, unknown>;
    runtime?: SessionRuntimeHints;
    meta?: DaemonRequestMeta;
};

export declare type DaemonRequestMeta = {
    requestId?: string;
    debug?: boolean;
    cwd?: string;
    sessionExplicit?: boolean;
    tenantId?: string;
    runId?: string;
    leaseId?: string;
    leaseTtlMs?: number;
    leaseBackend?: LeaseBackend;
    sessionIsolation?: SessionIsolationMode;
    uploadedArtifactId?: string;
    clientArtifactPaths?: Record<string, string>;
    installSource?: DaemonInstallSource;
    retainMaterializedPaths?: boolean;
    materializedPathRetentionMs?: number;
    materializationId?: string;
    lockPolicy?: DaemonLockPolicy;
    lockPlatform?: PlatformSelector;
    requestProgress?: 'replay-test';
};

export declare type DaemonResponse = {
    ok: true;
    data?: DaemonResponseData;
} | {
    ok: false;
    error: DaemonError;
};

export declare type DaemonResponseData = Record<string, unknown> & {
    artifacts?: DaemonArtifact[];
};

export declare const daemonRuntimeSchema: RuntimeSchema<SessionRuntimeHints>;

export declare type DaemonServerMode = (typeof DAEMON_SERVER_MODES)[number];

export declare type DaemonTransportPreference = (typeof DAEMON_TRANSPORT_PREFERENCES)[number];

export declare type DebugSymbolsCrashFrame = {
    index: number;
    image: string;
    address: string;
    symbol?: string;
};

export declare type DebugSymbolsCrashSummary = {
    format: 'ips' | 'text';
    appName?: string;
    bundleId?: string;
    version?: string;
    incident?: string;
    timestamp?: string;
    exceptionType?: string;
    exceptionCodes?: string;
    terminationReason?: string;
    crashedThread?: number;
    topFrames: DebugSymbolsCrashFrame[];
    findings: string[];
};

export declare type DebugSymbolsImage = {
    name: string;
    uuid: string;
    arch?: string;
    dsymPath: string;
    binaryPath: string;
};

export declare type DebugSymbolsOptions = {
    action?: 'symbols';
    artifact: string;
    dsym?: string;
    searchPath?: string;
    out?: string;
    cwd?: string;
};

export declare type DebugSymbolsResult = {
    kind: 'debugSymbols';
    platform: 'apple';
    artifactPath: string;
    outPath: string;
    crash: DebugSymbolsCrashSummary;
    matchedImages: DebugSymbolsImage[];
    symbolicatedFrames: number;
    skippedImages: number;
    warnings?: string[];
    message: string;
};

export declare function defaultHintForCode(code: string): string | undefined;

export declare type JsonRpcId = string | number | null;

export declare type JsonRpcRequestEnvelope<TParams = unknown> = {
    jsonrpc?: string;
    id?: JsonRpcId;
    method?: string;
    params?: TParams;
};

export declare const jsonRpcRequestSchema: RuntimeSchema<JsonRpcRequestEnvelope<unknown>>;

declare type KnownAppErrorCode = 'INVALID_ARGS' | 'DEVICE_NOT_FOUND' | 'DEVICE_IN_USE' | 'TOOL_MISSING' | 'APP_NOT_INSTALLED' | 'UNSUPPORTED_PLATFORM' | 'UNSUPPORTED_OPERATION' | 'NOT_IMPLEMENTED' | 'COMMAND_FAILED' | 'SESSION_NOT_FOUND' | 'UNAUTHORIZED' | 'AMBIGUOUS_MATCH' | 'UNKNOWN';

export declare const LEASE_BACKENDS: readonly ['ios-simulator', 'ios-instance', 'android-instance'];

export declare type LeaseAllocatePayload = {
    token?: string;
    session?: string;
    tenantId?: string;
    tenant?: string;
    runId?: string;
    ttlMs?: number;
    backend?: LeaseBackend;
};

export declare const leaseAllocateSchema: RuntimeSchema<LeaseAllocatePayload>;

export declare type LeaseBackend = (typeof LEASE_BACKENDS)[number];

export declare type LeaseHeartbeatPayload = {
    token?: string;
    session?: string;
    tenantId?: string;
    tenant?: string;
    runId?: string;
    leaseId?: string;
    ttlMs?: number;
};

export declare const leaseHeartbeatSchema: RuntimeSchema<LeaseHeartbeatPayload>;

export declare type LeaseReleasePayload = {
    token?: string;
    session?: string;
    tenantId?: string;
    tenant?: string;
    runId?: string;
    leaseId?: string;
};

export declare const leaseReleaseSchema: RuntimeSchema<LeaseReleasePayload>;

export declare const NETWORK_INCLUDE_MODES: readonly ['summary', 'headers', 'body', 'all'];

export declare type NetworkIncludeMode = (typeof NETWORK_INCLUDE_MODES)[number];

declare type NormalizedError = {
    code: string;
    message: string;
    hint?: string;
    diagnosticId?: string;
    logPath?: string;
    details?: Record<string, unknown>;
};

export declare function normalizeError(err: unknown, context?: {
    diagnosticId?: string;
    logPath?: string;
}): NormalizedError;

declare const PLATFORM_SELECTORS: readonly ["ios", "macos", "android", "linux", "apple"];

declare type PlatformSelector = (typeof PLATFORM_SELECTORS)[number];

declare type Point = {
    x: number;
    y: number;
};

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

export declare type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

declare type RuntimeSchema<T> = {
    parse(input: unknown): T;
};

export declare const SESSION_ISOLATION_MODES: readonly ['none', 'tenant'];

export declare type SessionIsolationMode = (typeof SESSION_ISOLATION_MODES)[number];

export declare type SessionRuntimeHints = {
    platform?: 'ios' | 'android';
    metroHost?: string;
    metroPort?: number;
    bundleUrl?: string;
    launchUrl?: string;
};

export declare type SnapshotNode = RawSnapshotNode & {
    ref: string;
};

export { }
