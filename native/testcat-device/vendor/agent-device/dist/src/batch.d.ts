export declare const BATCH_BLOCKED_COMMANDS: ReadonlySet<string>;

export declare type BatchFlags = Record<string, unknown> & {
    batchOnError?: 'stop';
    batchMaxSteps?: number;
    batchSteps?: DaemonBatchStep[];
};

export declare type BatchInvoke = (req: BatchRequest) => Promise<DaemonResponse>;

export declare type BatchRequest = Omit<DaemonRequest, 'flags'> & {
    flags?: BatchFlags | Record<string, unknown>;
};

export declare type BatchStepResult = {
    step: number;
    command: string;
    ok: true;
    data: Record<string, unknown>;
    durationMs: number;
};

export declare function buildBatchStepFlags(parentFlags: BatchFlags | Record<string, unknown> | undefined, stepFlags: DaemonBatchStep['flags'] | Record<string, unknown> | undefined): BatchFlags;

declare const DAEMON_LOCK_POLICIES: readonly ['reject', 'strip'];

declare type DaemonArtifact = {
    field: string;
    artifactId?: string;
    fileName?: string;
    localPath?: string;
    path?: string;
};

export declare type DaemonBatchStep = {
    command: string;
    positionals?: string[];
    flags?: Record<string, unknown>;
    runtime?: unknown;
};

declare type DaemonError = {
    code: string;
    message: string;
    hint?: string;
    diagnosticId?: string;
    logPath?: string;
    details?: Record<string, unknown>;
};

declare type DaemonInstallSource = {
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

declare type DaemonLockPolicy = (typeof DAEMON_LOCK_POLICIES)[number];

declare type DaemonRequest = {
    token?: string;
    session?: string;
    command: string;
    positionals: string[];
    flags?: Record<string, unknown>;
    runtime?: SessionRuntimeHints;
    meta?: DaemonRequestMeta;
};

declare type DaemonRequestMeta = {
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

declare type DaemonResponse = {
    ok: true;
    data?: DaemonResponseData;
} | {
    ok: false;
    error: DaemonError;
};

declare type DaemonResponseData = Record<string, unknown> & {
    artifacts?: DaemonArtifact[];
};

export declare const DEFAULT_BATCH_MAX_STEPS = 100;

export declare const INHERITED_PARENT_FLAG_KEYS: readonly ['platform', 'target', 'device', 'udid', 'serial', 'verbose', 'out'];

declare const LEASE_BACKENDS: readonly ['ios-simulator', 'ios-instance', 'android-instance'];

declare type LeaseBackend = (typeof LEASE_BACKENDS)[number];

export declare type NormalizedBatchStep = {
    command: string;
    positionals: string[];
    flags: Record<string, unknown>;
    runtime?: unknown;
};

declare const PLATFORM_SELECTORS: readonly ["ios", "macos", "android", "linux", "apple"];

declare type PlatformSelector = (typeof PLATFORM_SELECTORS)[number];

export declare function runBatch(req: BatchRequest, sessionName: string, invoke: BatchInvoke): Promise<DaemonResponse>;

declare const SESSION_ISOLATION_MODES: readonly ['none', 'tenant'];

declare type SessionIsolationMode = (typeof SESSION_ISOLATION_MODES)[number];

declare type SessionRuntimeHints = {
    platform?: 'ios' | 'android';
    metroHost?: string;
    metroPort?: number;
    bundleUrl?: string;
    launchUrl?: string;
};

export declare function validateAndNormalizeBatchSteps(steps: unknown, maxSteps: number): NormalizedBatchStep[];

export { }
