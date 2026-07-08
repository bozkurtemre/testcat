export declare type AgentDeviceClient = {
    command: AgentDeviceCommandClient;
    devices: {
        list: (options?: AgentDeviceRequestOverrides & AgentDeviceSelectionOptions) => Promise<AgentDeviceDevice[]>;
        boot: (options?: DeviceBootOptions) => Promise<CommandRequestResult>;
        shutdown: (options?: DeviceShutdownOptions) => Promise<CommandRequestResult>;
    };
    sessions: {
        list: (options?: AgentDeviceRequestOverrides) => Promise<AgentDeviceSession[]>;
        stateDir: (options?: AgentDeviceRequestOverrides & Pick<AgentDeviceClientConfig, 'stateDir'>) => Promise<string>;
        close: (options?: AgentDeviceRequestOverrides & {
            shutdown?: boolean;
        }) => Promise<SessionCloseResult>;
    };
    apps: {
        install: (options: AppDeployOptions) => Promise<AppDeployResult>;
        reinstall: (options: AppDeployOptions) => Promise<AppDeployResult>;
        installFromSource: (options: AppInstallFromSourceOptions) => Promise<AppInstallFromSourceResult>;
        list: (options?: AppListOptions) => Promise<string[]>;
        open: (options: AppOpenOptions) => Promise<AppOpenResult>;
        close: (options?: AppCloseOptions) => Promise<AppCloseResult>;
        push: (options: AppPushOptions) => Promise<CommandRequestResult>;
        triggerEvent: (options: AppTriggerEventOptions) => Promise<CommandRequestResult>;
    };
    materializations: {
        release: (options: MaterializationReleaseOptions) => Promise<MaterializationReleaseResult>;
    };
    leases: {
        allocate: (options: LeaseAllocateOptions) => Promise<Lease>;
        heartbeat: (options: LeaseScopedOptions) => Promise<Lease>;
        release: (options: LeaseScopedOptions) => Promise<{
            released: boolean;
        }>;
    };
    metro: {
        prepare: (options: MetroPrepareOptions) => Promise<MetroPrepareResult>;
        reload: (options?: MetroReloadOptions) => Promise<MetroReloadResult>;
    };
    capture: {
        snapshot: (options?: CaptureSnapshotOptions) => Promise<CaptureSnapshotResult>;
        screenshot: (options?: CaptureScreenshotOptions) => Promise<CaptureScreenshotResult>;
        diff: (options: CaptureDiffOptions) => Promise<CommandRequestResult>;
    };
    interactions: {
        click: (options: ClickOptions) => Promise<CommandRequestResult>;
        press: (options: PressOptions) => Promise<CommandRequestResult>;
        longPress: (options: LongPressOptions) => Promise<CommandRequestResult>;
        swipe: (options: SwipeOptions) => Promise<CommandRequestResult>;
        pan: (options: PanOptions) => Promise<CommandRequestResult>;
        fling: (options: FlingOptions) => Promise<CommandRequestResult>;
        swipeGesture: (options: SwipeGestureOptions) => Promise<CommandRequestResult>;
        focus: (options: FocusOptions_2) => Promise<CommandRequestResult>;
        type: (options: TypeTextOptions) => Promise<CommandRequestResult>;
        fill: (options: FillOptions) => Promise<CommandRequestResult>;
        scroll: (options: ScrollOptions_2) => Promise<CommandRequestResult>;
        pinch: (options: PinchOptions) => Promise<CommandRequestResult>;
        rotateGesture: (options: RotateGestureOptions) => Promise<CommandRequestResult>;
        transformGesture: (options: TransformGestureOptions) => Promise<CommandRequestResult>;
        get: (options: GetOptions) => Promise<CommandRequestResult>;
        is: (options: IsOptions) => Promise<CommandRequestResult>;
        find: (options: FindOptions) => Promise<CommandRequestResult>;
    };
    replay: {
        run: (options: ReplayRunOptions) => Promise<CommandRequestResult>;
        test: (options: ReplayTestOptions) => Promise<CommandRequestResult>;
    };
    batch: {
        run: (options: BatchRunOptions) => Promise<CommandRequestResult>;
    };
    observability: {
        perf: (options?: PerfOptions) => Promise<CommandRequestResult>;
        logs: (options?: LogsOptions) => Promise<CommandRequestResult>;
        network: (options?: NetworkOptions) => Promise<CommandRequestResult>;
    };
    debug: {
        symbols: (options: DebugSymbolsOptions) => Promise<DebugSymbolsResult>;
    };
    recording: {
        record: (options: RecordOptions) => Promise<CommandRequestResult>;
        trace: (options: TraceOptions) => Promise<CommandRequestResult>;
    };
    settings: {
        update: (options: SettingsUpdateOptions) => Promise<CommandRequestResult>;
    };
};

export declare type AgentDeviceClientConfig = {
    session?: string;
    lockPolicy?: DaemonLockPolicy;
    lockPlatform?: PlatformSelector;
    requestId?: string;
    stateDir?: string;
    daemonBaseUrl?: string;
    daemonAuthToken?: string;
    daemonTransport?: DaemonTransportPreference;
    daemonServerMode?: DaemonServerMode;
    tenant?: string;
    sessionIsolation?: SessionIsolationMode;
    runId?: string;
    leaseId?: string;
    leaseBackend?: LeaseBackend;
    runtime?: SessionRuntimeHints;
    cwd?: string;
    debug?: boolean;
    iosXctestrunFile?: string;
    iosXctestDerivedDataPath?: string;
    iosXctestEnvDir?: string;
};

export declare type AgentDeviceCommandClient = {
    wait: (options: WaitCommandOptions) => Promise<WaitCommandResult>;
    alert: (options?: AlertCommandOptions) => Promise<AlertCommandResult>;
    appState: (options?: AppStateCommandOptions) => Promise<AppStateCommandResult>;
    back: (options?: BackCommandOptions) => Promise<BackCommandResult>;
    home: (options?: HomeCommandOptions) => Promise<HomeCommandResult>;
    rotate: (options: RotateCommandOptions) => Promise<RotateCommandResult>;
    appSwitcher: (options?: AppSwitcherCommandOptions) => Promise<AppSwitcherCommandResult>;
    keyboard: (options?: KeyboardCommandOptions) => Promise<KeyboardCommandResult>;
    clipboard: (options: ClipboardCommandOptions) => Promise<ClipboardCommandResult>;
    reactNative: (options: ReactNativeCommandOptions) => Promise<CommandRequestResult>;
    prepare: (options: PrepareCommandOptions) => Promise<CommandRequestResult>;
};

export declare type AgentDeviceDaemonTransport = (req: Omit<DaemonRequest, 'token'>) => Promise<DaemonResponse>;

export declare type AgentDeviceDevice = {
    platform: Platform;
    target: DeviceTarget;
    kind: DeviceKind;
    id: string;
    name: string;
    booted?: boolean;
    identifiers: AgentDeviceIdentifiers;
    ios?: {
        udid: string;
    };
    android?: {
        serial: string;
    };
};

export declare type AgentDeviceIdentifiers = {
    session?: string;
    deviceId?: string;
    deviceName?: string;
    udid?: string;
    serial?: string;
    appId?: string;
    appBundleId?: string;
    package?: string;
};

export declare type AgentDeviceRequestOverrides = Pick<AgentDeviceClientConfig, 'session' | 'lockPolicy' | 'lockPlatform' | 'requestId' | 'daemonBaseUrl' | 'daemonAuthToken' | 'daemonTransport' | 'daemonServerMode' | 'tenant' | 'sessionIsolation' | 'runId' | 'leaseId' | 'leaseBackend' | 'cwd' | 'debug' | 'iosXctestrunFile' | 'iosXctestDerivedDataPath' | 'iosXctestEnvDir'>;

export declare type AgentDeviceSelectionOptions = {
    platform?: PlatformSelector;
    target?: DeviceTarget;
    device?: string;
    udid?: string;
    serial?: string;
    iosSimulatorDeviceSet?: string;
    androidDeviceAllowlist?: string;
};

export declare type AgentDeviceSession = {
    name: string;
    createdAt: number;
    sessionStateDir?: string;
    runnerLogPath?: string;
    device: AgentDeviceSessionDevice;
    identifiers: AgentDeviceIdentifiers;
};

export declare type AgentDeviceSessionDevice = {
    platform: Platform;
    target: DeviceTarget;
    id: string;
    name: string;
    identifiers: AgentDeviceIdentifiers;
    ios?: {
        udid: string;
        simulatorSetPath?: string | null;
    };
    android?: {
        serial: string;
    };
};

declare const ALERT_ACTIONS: readonly ['get', 'accept', 'dismiss', 'wait'];

export declare type AlertAction = (typeof ALERT_ACTIONS)[number];

export declare type AlertCommandOptions = DeviceCommandBaseOptions & {
    action?: AlertAction;
    timeoutMs?: number;
};

export declare type AlertCommandResult = DaemonResponseData & {
    kind?: 'alertStatus' | 'alertHandled' | 'alertWait';
    action?: AlertCommandOptions['action'];
    alert?: AlertInfo | null;
    handled?: boolean;
    button?: string;
    waitedMs?: number;
    timedOut?: boolean;
    platform?: AlertInfo['platform'];
    accepted?: boolean;
    dismissed?: boolean;
    items?: string[];
};

export declare type AlertInfo = {
    title?: string;
    message?: string;
    buttons?: string[];
    platform?: AlertPlatform;
    source?: AlertSource;
    packageName?: string;
};

export declare type AlertPlatform = 'android' | 'ios' | 'macos';

export declare type AlertSource = 'permission' | 'native-dialog' | 'system-dialog';

declare type AndroidSnapshotBackendMetadata = {
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

declare type AndroidSnapshotHelperInstallReason = 'missing' | 'outdated' | 'forced' | 'current' | 'skipped';

declare type AndroidSnapshotHelperTransport = 'instrumentation' | 'persistent-session';

export declare type AppCloseOptions = AgentDeviceRequestOverrides & {
    app?: string;
    shutdown?: boolean;
};

export declare type AppCloseResult = {
    session: string;
    closedApp?: string;
    shutdown?: Record<string, unknown>;
    identifiers: AgentDeviceIdentifiers;
};

export declare type AppDeployOptions = AgentDeviceRequestOverrides & AgentDeviceSelectionOptions & {
    app: string;
    appPath: string;
};

export declare type AppDeployResult = {
    app: string;
    appPath: string;
    platform: Platform;
    appId?: string;
    bundleId?: string;
    package?: string;
    identifiers: AgentDeviceIdentifiers;
};

export declare class AppError extends Error {
    code: AppErrorCode;
    details?: AppErrorDetails;
    cause?: unknown;
    constructor(code: AppErrorCode, message: string, details?: AppErrorDetails, cause?: unknown);
}

export declare type AppErrorCode = KnownAppErrorCode | (string & {});

declare type AppErrorDetails = Record<string, unknown> & {
    hint?: string;
    diagnosticId?: string;
    logPath?: string;
};

export declare type AppInstallFromSourceOptions = AgentDeviceRequestOverrides & AgentDeviceSelectionOptions & {
    source: DaemonInstallSource;
    retainPaths?: boolean;
    retentionMs?: number;
};

export declare type AppInstallFromSourceResult = {
    appName?: string;
    appId?: string;
    bundleId?: string;
    packageName?: string;
    launchTarget: string;
    installablePath?: string;
    archivePath?: string;
    materializationId?: string;
    materializationExpiresAt?: string;
    identifiers: AgentDeviceIdentifiers;
};

export declare type AppListOptions = AgentDeviceRequestOverrides & AgentDeviceSelectionOptions & {
    appsFilter?: AppsFilter;
};

export declare type AppOpenOptions = AgentDeviceRequestOverrides & AgentDeviceSelectionOptions & {
    app?: string;
    url?: string;
    surface?: SessionSurface;
    activity?: string;
    launchConsole?: string;
    launchArgs?: string[];
    relaunch?: boolean;
    saveScript?: boolean | string;
    deviceHub?: boolean;
    noRecord?: boolean;
    runtime?: SessionRuntimeHints;
};

export declare type AppOpenResult = {
    session: string;
    sessionStateDir?: string;
    runnerLogPath?: string;
    requestLogPath?: string;
    appName?: string;
    appBundleId?: string;
    appId?: string;
    startup?: StartupPerfSample;
    runtime?: SessionRuntimeHints;
    device?: AgentDeviceSessionDevice;
    identifiers: AgentDeviceIdentifiers;
};

export declare type AppPushOptions = DeviceCommandBaseOptions & {
    app: string;
    payload: string | Record<string, unknown>;
};

declare type AppsFilter = 'user-installed' | 'all';

export declare type AppStateCommandOptions = DeviceCommandBaseOptions;

export declare type AppStateCommandResult = DaemonResponseData & {
    platform?: Platform;
    appName?: string;
    appBundleId?: string;
    package?: string;
    activity?: string;
    source?: 'session';
    surface?: SessionSurface;
};

export declare type AppSwitcherCommandOptions = DeviceCommandBaseOptions;

export declare type AppSwitcherCommandResult = CommandActionResult<'app-switcher'>;

export declare type AppTriggerEventOptions = DeviceCommandBaseOptions & {
    event: string;
    payload?: Record<string, unknown>;
};

export declare type ArtifactAdapter = {
    resolveInput(ref: FileInputRef, options: ResolveInputOptions): Promise<ResolvedInputFile>;
    reserveOutput(ref: FileOutputRef | undefined, options: ReserveOutputOptions): Promise<ReservedOutputFile>;
    createTempFile(options: CreateTempFileOptions): Promise<TemporaryFile>;
};

export declare type ArtifactDescriptor = {
    kind: 'localPath';
    field: string;
    path: string;
    fileName?: string;
    metadata?: Record<string, unknown>;
} | {
    kind: 'artifact';
    field: string;
    artifactId: string;
    fileName?: string;
    url?: string;
    clientPath?: string;
    metadata?: Record<string, unknown>;
};

declare const BACK_MODES: readonly ['in-app', 'system'];

export declare type BackCommandOptions = DeviceCommandBaseOptions & {
    mode?: BackMode;
};

export declare type BackCommandResult = CommandActionResult<'back'> & {
    mode?: BackMode;
};

declare type BackMode = (typeof BACK_MODES)[number];

export declare type BatchRunOptions = AgentDeviceRequestOverrides & {
    steps: BatchStep[];
    onError?: 'stop';
    maxSteps?: number;
    out?: string;
};

export declare type BatchStep = {
    command: string;
    input: Record<string, unknown>;
    runtime?: unknown;
};

export declare type CaptureDiffOptions = DeviceCommandBaseOptions & Pick<CaptureSnapshotOptions, 'interactiveOnly' | 'depth' | 'scope' | 'raw'> & {
    kind: 'snapshot';
    out?: string;
};

export declare type CaptureScreenshotOptions = AgentDeviceRequestOverrides & {
    path?: string;
    overlayRefs?: boolean;
    fullscreen?: boolean;
    maxSize?: number;
    stabilize?: boolean;
    surface?: SessionSurface;
};

export declare type CaptureScreenshotResult = {
    path: string;
    overlayRefs?: ScreenshotOverlayRef[];
    identifiers: AgentDeviceIdentifiers;
};

export declare type CaptureSnapshotOptions = AgentDeviceRequestOverrides & AgentDeviceSelectionOptions & {
    interactiveOnly?: boolean;
    depth?: number;
    scope?: string;
    raw?: boolean;
    forceFull?: boolean;
    timeoutMs?: number;
};

export declare type CaptureSnapshotResult = {
    nodes: SnapshotNode[];
    truncated: boolean;
    appName?: string;
    appBundleId?: string;
    visibility?: SnapshotVisibility;
    unchanged?: SnapshotUnchanged;
    snapshotDiagnostics?: SnapshotDiagnosticsSummary;
    identifiers: AgentDeviceIdentifiers;
} & PublicSnapshotCaptureAnnotations;

export declare function centerOfRect(rect: Rect): Point;

declare const CLICK_BUTTONS: readonly ['primary', 'secondary', 'middle'];

declare type ClickButton = (typeof CLICK_BUTTONS)[number];

export declare type ClickOptions = DeviceCommandBaseOptions & SelectorSnapshotCommandOptions & InteractionTarget & RepeatedPressOptions & {
    button?: ClickButton;
};

export declare type ClipboardCommandOptions = (DeviceCommandBaseOptions & {
    action: 'read';
}) | (DeviceCommandBaseOptions & {
    action: 'write';
    text: string;
});

export declare type ClipboardCommandResult = (DaemonResponseData & {
    action: 'read';
    text: string;
}) | (DaemonResponseData & {
    action: 'write';
    textLength: number;
});

declare type CommandActionResult<T extends string> = DaemonResponseData & {
    action?: T;
};

export declare type CommandRequestResult = DaemonResponseData;

declare type CompanionTunnelScope = {
    tenantId: string;
    runId: string;
    leaseId: string;
};

export declare function createAgentDeviceClient(config?: AgentDeviceClientConfig, deps?: {
    transport?: AgentDeviceDaemonTransport;
}): AgentDeviceClient;

export declare function createLocalArtifactAdapter(options?: LocalArtifactAdapterOptions): ArtifactAdapter;

export declare type CreateTempFileOptions = {
    prefix: string;
    ext: string;
};

declare const DAEMON_LOCK_POLICIES: readonly ['reject', 'strip'];

declare const DAEMON_SERVER_MODES: readonly ['socket', 'http', 'dual'];

declare const DAEMON_TRANSPORT_PREFERENCES: readonly ['auto', 'socket', 'http'];

declare type DaemonArtifact = {
    field: string;
    artifactId?: string;
    fileName?: string;
    localPath?: string;
    path?: string;
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

declare type DaemonServerMode = (typeof DAEMON_SERVER_MODES)[number];

declare type DaemonTransportPreference = (typeof DAEMON_TRANSPORT_PREFERENCES)[number];

declare type DebugSymbolsCrashFrame = {
    index: number;
    image: string;
    address: string;
    symbol?: string;
};

declare type DebugSymbolsCrashSummary = {
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

declare type DebugSymbolsImage = {
    name: string;
    uuid: string;
    arch?: string;
    dsymPath: string;
    binaryPath: string;
};

declare type DebugSymbolsOptions = {
    action?: 'symbols';
    artifact: string;
    dsym?: string;
    searchPath?: string;
    out?: string;
    cwd?: string;
};

declare type DebugSymbolsResult = {
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

declare const DEVICE_KINDS: readonly ['simulator', 'emulator', 'device'];

declare const DEVICE_ROTATIONS: readonly ['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right'];

declare const DEVICE_TARGETS: readonly ['mobile', 'tv', 'desktop'];

export declare type DeviceBootOptions = DeviceCommandBaseOptions & {
    headless?: boolean;
};

declare type DeviceCommandBaseOptions = AgentDeviceRequestOverrides & AgentDeviceSelectionOptions;

declare type DeviceKind = (typeof DEVICE_KINDS)[number];

declare type DeviceRotation = (typeof DEVICE_ROTATIONS)[number];

export declare type DeviceShutdownOptions = DeviceCommandBaseOptions;

declare type DeviceTarget = (typeof DEVICE_TARGETS)[number];

export declare type ElementTarget = RefTarget | SelectorTarget;

export declare type FileInputRef = {
    kind: 'path';
    path: string;
} | {
    kind: 'uploadedArtifact';
    id: string;
};

export declare type FileOutputRef = {
    kind: 'path';
    path: string;
} | {
    kind: 'downloadableArtifact';
    clientPath?: string;
    fileName?: string;
};

export declare type FillOptions = DeviceCommandBaseOptions & SelectorSnapshotCommandOptions & InteractionTarget & {
    text: string;
    delayMs?: number;
};

declare const FIND_LOCATORS: readonly ['any', 'text', 'label', 'value', 'role', 'id'];

declare type FindBaseOptions = DeviceCommandBaseOptions & FindSnapshotCommandOptions & {
    locator?: FindLocator;
    query: string;
    first?: boolean;
    last?: boolean;
};

export declare type FindLocator = (typeof FIND_LOCATORS)[number];

export declare type FindOptions = (FindBaseOptions & {
    action?: 'click' | 'focus' | 'exists' | 'getText' | 'getAttrs';
}) | (FindBaseOptions & {
    action: 'wait';
    timeoutMs?: number;
}) | (FindBaseOptions & {
    action: 'fill' | 'type';
    value: string;
});

declare type FindSnapshotCommandOptions = Pick<CaptureSnapshotOptions, 'depth' | 'raw'>;

declare type FlingOptions = DeviceCommandBaseOptions & {
    direction: ScrollDirection;
    x: number;
    y: number;
    distance?: number;
    durationMs?: number;
};

declare type FocusOptions_2 = DeviceCommandBaseOptions & {
    x: number;
    y: number;
};
export { FocusOptions_2 as FocusOptions }

export declare type GetOptions = DeviceCommandBaseOptions & SelectorSnapshotCommandOptions & ElementTarget & {
    format: 'text' | 'attrs';
};

export declare type HomeCommandOptions = DeviceCommandBaseOptions;

export declare type HomeCommandResult = CommandActionResult<'home'>;

export declare type InteractionTarget = PointTarget | RefTarget | SelectorTarget;

export declare function isAgentDeviceError(err: unknown): err is AppError;

export declare type IsOptions = IsTextPredicateOptions | IsStatePredicateOptions;

declare type IsStatePredicateOptions = DeviceCommandBaseOptions & SelectorSnapshotCommandOptions & {
    predicate: 'visible' | 'hidden' | 'exists' | 'editable' | 'selected';
    selector: string;
    value?: never;
};

declare type IsTextPredicateOptions = DeviceCommandBaseOptions & SelectorSnapshotCommandOptions & {
    predicate: 'text';
    selector: string;
    value: string;
};

export declare type KeyboardCommandOptions = DeviceCommandBaseOptions & {
    action?: 'status' | 'dismiss' | 'enter' | 'return';
};

export declare type KeyboardCommandResult = DaemonResponseData & {
    platform?: 'android' | 'ios';
    action?: 'status' | 'dismiss' | 'enter';
    visible?: boolean;
    inputType?: string | null;
    inputMethodPackage?: string | null;
    type?: string | null;
    focusedPackage?: string | null;
    focusedResourceId?: string | null;
    inputOwner?: 'app' | 'ime' | 'unknown';
    wasVisible?: boolean;
    dismissed?: boolean;
    attempts?: number;
};

declare type KnownAppErrorCode = 'INVALID_ARGS' | 'DEVICE_NOT_FOUND' | 'DEVICE_IN_USE' | 'TOOL_MISSING' | 'APP_NOT_INSTALLED' | 'UNSUPPORTED_PLATFORM' | 'UNSUPPORTED_OPERATION' | 'NOT_IMPLEMENTED' | 'COMMAND_FAILED' | 'SESSION_NOT_FOUND' | 'UNAUTHORIZED' | 'AMBIGUOUS_MATCH' | 'UNKNOWN';

declare type Lease = {
    leaseId: string;
    tenantId: string;
    runId: string;
    backend: LeaseBackend;
    createdAt?: number;
    heartbeatAt?: number;
    expiresAt?: number;
};

declare const LEASE_BACKENDS: readonly ['ios-simulator', 'ios-instance', 'android-instance'];

declare type LeaseAllocateOptions = LeaseOptions & {
    tenant: string;
    runId: string;
    leaseBackend?: LeaseBackend;
};

declare type LeaseBackend = (typeof LEASE_BACKENDS)[number];

declare type LeaseOptions = AgentDeviceRequestOverrides & {
    ttlMs?: number;
};

declare type LeaseScopedOptions = LeaseOptions & {
    tenant?: string;
    runId?: string;
    leaseId: string;
};

export declare type LocalArtifactAdapterOptions = {
    cwd?: string;
    tempDir?: string;
    rootDir?: string;
};

declare const LOG_ACTION_VALUES: readonly ['path', 'start', 'stop', 'doctor', 'mark', 'clear'];

declare type LogAction = (typeof LOG_ACTION_VALUES)[number];

export declare type LogsOptions = AgentDeviceRequestOverrides & {
    action?: LogAction;
    message?: string;
    restart?: boolean;
};

export declare type LongPressOptions = DeviceCommandBaseOptions & SelectorSnapshotCommandOptions & InteractionTarget & {
    durationMs?: number;
};

export declare type MaterializationReleaseOptions = AgentDeviceRequestOverrides & {
    materializationId: string;
};

export declare type MaterializationReleaseResult = {
    released: boolean;
    materializationId: string;
    identifiers: AgentDeviceIdentifiers;
};

declare type MetroBridgeResult = {
    enabled: boolean;
    baseUrl: string;
    statusUrl: string;
    bundleUrl: string;
    iosRuntime: MetroRuntimeHints;
    androidRuntime: MetroRuntimeHints;
    upstream: {
        bundleUrl: string;
        host: string;
        port: number;
        statusUrl: string;
    };
    probe: {
        reachable: boolean;
        statusCode: number;
        latencyMs: number;
        detail: string;
    };
};

declare type MetroBridgeScope = CompanionTunnelScope;

declare type MetroPrepareKind = 'auto' | 'react-native' | 'expo';

export declare type MetroPrepareOptions = {
    projectRoot?: string;
    kind?: MetroPrepareKind;
    publicBaseUrl?: string;
    proxyBaseUrl?: string;
    bearerToken?: string;
    bridgeScope?: MetroBridgeScope;
    launchUrl?: string;
    companionProfileKey?: string;
    companionConsumerKey?: string;
    port?: number;
    listenHost?: string;
    statusHost?: string;
    startupTimeoutMs?: number;
    probeTimeoutMs?: number;
    reuseExisting?: boolean;
    installDependenciesIfNeeded?: boolean;
    runtimeFilePath?: string;
    logPath?: string;
};

export declare type MetroPrepareResult = PrepareMetroRuntimeResult;

export declare type MetroReloadOptions = {
    metroHost?: string;
    metroPort?: number;
    bundleUrl?: string;
    timeoutMs?: number;
};

export declare type MetroReloadResult = ReloadMetroResult;

/** Re-export of {@link SessionRuntimeHints} under the Metro-specific alias used by public API consumers. */
declare type MetroRuntimeHints = SessionRuntimeHints;

declare const NETWORK_INCLUDE_MODES: readonly ['summary', 'headers', 'body', 'all'];

declare type NetworkIncludeMode = (typeof NETWORK_INCLUDE_MODES)[number];

export declare type NetworkOptions = AgentDeviceRequestOverrides & {
    action?: 'dump' | 'log';
    limit?: number;
    include?: NetworkIncludeMode;
};

export declare function normalizeAgentDeviceError(err: unknown, context?: {
    diagnosticId?: string;
    logPath?: string;
}): NormalizedError;

export declare type NormalizedError = {
    code: string;
    message: string;
    hint?: string;
    diagnosticId?: string;
    logPath?: string;
    details?: Record<string, unknown>;
};

export declare type OutputVisibility = 'client-visible' | 'internal';

declare type PanOptions = DeviceCommandBaseOptions & {
    x: number;
    y: number;
    dx: number;
    dy: number;
    durationMs?: number;
};

declare const PERF_ACTION_VALUES: readonly ['sample', 'snapshot', 'start', 'stop', 'report'];

declare const PERF_AREA_VALUES: readonly ['metrics', 'frames', 'memory', 'cpu', 'trace'];

declare const PERF_KIND_VALUES: readonly ['xctrace', 'simpleperf', 'perfetto', 'android-hprof', 'memgraph'];

declare const PERF_SUBJECT_VALUES: readonly ['profile'];

declare type PerfAction = (typeof PERF_ACTION_VALUES)[number];

declare type PerfArea = (typeof PERF_AREA_VALUES)[number];

declare type PerfKind = (typeof PERF_KIND_VALUES)[number];

export declare type PerfOptions = DeviceCommandBaseOptions & {
    area?: PerfArea;
    subject?: PerfSubject;
    action?: PerfAction;
    kind?: PerfKind;
    template?: string;
    out?: string;
    tracePath?: string;
};

declare type PerfSubject = (typeof PERF_SUBJECT_VALUES)[number];

export declare type PermissionTarget = 'camera' | 'microphone' | 'photos' | 'contacts' | 'contacts-limited' | 'notifications' | 'calendar' | 'location' | 'location-always' | 'media-library' | 'motion' | 'reminders' | 'siri' | 'accessibility' | 'screen-recording' | 'input-monitoring';

export declare type PinchOptions = DeviceCommandBaseOptions & {
    scale: number;
    x?: number;
    y?: number;
};

declare type Platform = (typeof PLATFORMS)[number];

declare const PLATFORM_SELECTORS: readonly ["ios", "macos", "android", "linux", "apple"];

declare const PLATFORMS: readonly ['ios', 'macos', 'android', 'linux'];

declare type PlatformSelector = (typeof PLATFORM_SELECTORS)[number];

export declare type Point = {
    x: number;
    y: number;
};

declare type PointTarget = {
    x: number;
    y: number;
    ref?: never;
    selector?: never;
    label?: never;
};

declare type PrepareCommandOptions = DeviceCommandBaseOptions & {
    action: 'ios-runner';
    timeoutMs?: number;
};

declare type PrepareMetroRuntimeResult = {
    projectRoot: string;
    kind: ResolvedMetroKind;
    dependenciesInstalled: boolean;
    packageManager: string | null;
    started: boolean;
    reused: boolean;
    pid: number;
    logPath: string;
    statusUrl: string;
    runtimeFilePath: string | null;
    iosRuntime: MetroRuntimeHints;
    androidRuntime: MetroRuntimeHints;
    bridge: MetroBridgeResult | null;
};

export declare type PressOptions = DeviceCommandBaseOptions & SelectorSnapshotCommandOptions & InteractionTarget & RepeatedPressOptions;

declare type PublicSnapshotCaptureAnnotations = Pick<SnapshotCaptureAnnotations, 'androidSnapshot' | 'warnings'> & {
    snapshotQuality?: SnapshotQualityVerdict;
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

declare type ReactNativeCommandOptions = DeviceCommandBaseOptions & {
    action: 'dismiss-overlay';
};

declare type RecordingQuality = 5 | 6 | 7 | 8 | 9 | 10;

export declare type RecordOptions = AgentDeviceRequestOverrides & {
    action: 'start' | 'stop';
    path?: string;
    fps?: number;
    quality?: RecordingQuality;
    hideTouches?: boolean;
};

export declare type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

declare type RefTarget = {
    ref: string;
    label?: string;
    x?: never;
    y?: never;
    selector?: never;
};

declare type ReloadMetroResult = {
    reloaded: true;
    reloadUrl: string;
    status: number;
    body: string;
};

declare type RepeatedPressOptions = {
    count?: number;
    intervalMs?: number;
    holdMs?: number;
    jitterPx?: number;
    doubleTap?: boolean;
};

export declare type ReplayRunOptions = AgentDeviceRequestOverrides & AgentDeviceSelectionOptions & {
    path: string;
    update?: boolean;
    /** @deprecated Use backend: 'maestro'. */
    maestro?: boolean;
    backend?: string;
    env?: string[];
    timeoutMs?: number;
};

export declare type ReplayTestOptions = AgentDeviceRequestOverrides & AgentDeviceSelectionOptions & {
    paths: string[];
    update?: boolean;
    /** @deprecated Use backend: 'maestro'. */
    maestro?: boolean;
    backend?: string;
    env?: string[];
    failFast?: boolean;
    timeoutMs?: number;
    retries?: number;
    recordVideo?: boolean;
    artifactsDir?: string;
    reportJunit?: string;
    shardAll?: number;
    shardSplit?: number;
};

export declare type ReservedOutputFile = {
    path: string;
    visibility: OutputVisibility;
    publish: () => Promise<ArtifactDescriptor | undefined>;
    cleanup?: () => Promise<void>;
};

export declare type ReserveOutputOptions = {
    field: string;
    ext: string;
    requestedClientPath?: string;
    visibility?: OutputVisibility;
};

export declare type ResolvedInputFile = {
    path: string;
    cleanup?: () => Promise<void>;
};

declare type ResolvedMetroKind = Exclude<MetroPrepareKind, 'auto'>;

export declare type ResolveInputOptions = {
    usage: string;
    field?: string;
};

export declare type RotateCommandOptions = DeviceCommandBaseOptions & {
    orientation: DeviceRotation;
};

export declare type RotateCommandResult = CommandActionResult<'rotate'> & {
    orientation?: RotateCommandOptions['orientation'];
};

declare type RotateGestureOptions = DeviceCommandBaseOptions & {
    degrees: number;
    x?: number;
    y?: number;
    velocity?: number;
};

export declare type ScreenshotOverlayRef = {
    ref: string;
    label?: string;
    rect: Rect;
    overlayRect: Rect;
    center: Point;
};

declare const SCROLL_DIRECTIONS: readonly ['up', 'down', 'left', 'right'];

declare const SCROLL_INPUT_DIRECTIONS: readonly ['up', 'down', 'left', 'right', 'top', 'bottom'];

declare type ScrollDirection = (typeof SCROLL_DIRECTIONS)[number];

declare type ScrollInputDirection = (typeof SCROLL_INPUT_DIRECTIONS)[number];

declare type ScrollOptions_2 = DeviceCommandBaseOptions & {
    direction: ScrollInputDirection;
    amount?: number;
    pixels?: number;
};
export { ScrollOptions_2 as ScrollOptions }

declare type SelectorSnapshotCommandOptions = Pick<CaptureSnapshotOptions, 'depth' | 'scope' | 'raw'>;

declare type SelectorTarget = {
    selector: string;
    x?: never;
    y?: never;
    ref?: never;
    label?: never;
};

declare const SESSION_ISOLATION_MODES: readonly ['none', 'tenant'];

declare const SESSION_SURFACES: readonly ['app', 'frontmost-app', 'desktop', 'menubar'];

export declare type SessionCloseResult = {
    session: string;
    shutdown?: Record<string, unknown>;
    identifiers: AgentDeviceIdentifiers;
};

declare type SessionIsolationMode = (typeof SESSION_ISOLATION_MODES)[number];

declare type SessionRuntimeHints = {
    platform?: 'ios' | 'android';
    metroHost?: string;
    metroPort?: number;
    bundleUrl?: string;
    launchUrl?: string;
};

declare type SessionSurface = (typeof SESSION_SURFACES)[number];

export declare type SettingsUpdateOptions = (DeviceCommandBaseOptions & {
    setting: 'clear-app-state';
    state: 'clear';
    app?: string;
}) | (DeviceCommandBaseOptions & {
    setting: 'wifi' | 'airplane' | 'location';
    state: 'on' | 'off';
}) | (DeviceCommandBaseOptions & {
    setting: 'location';
    state: 'set';
    latitude: number;
    longitude: number;
}) | (DeviceCommandBaseOptions & {
    setting: 'animations';
    state: 'on' | 'off';
}) | (DeviceCommandBaseOptions & {
    setting: 'appearance';
    state: 'light' | 'dark' | 'toggle';
}) | (DeviceCommandBaseOptions & {
    setting: 'faceid' | 'touchid';
    state: 'match' | 'nonmatch' | 'enroll' | 'unenroll';
}) | (DeviceCommandBaseOptions & {
    setting: 'fingerprint';
    state: 'match' | 'nonmatch';
}) | (DeviceCommandBaseOptions & {
    setting: 'permission';
    state: 'grant' | 'deny' | 'reset';
    permission: PermissionTarget;
    mode?: 'full' | 'limited';
});

declare type SnapshotCaptureAnalysis = {
    rawNodeCount: number;
    maxDepth: number;
};

declare type SnapshotCaptureAnnotations = {
    analysis?: SnapshotCaptureAnalysis;
    androidSnapshot?: AndroidSnapshotBackendMetadata;
    freshness?: SnapshotCaptureFreshness;
    quality?: SnapshotQualityVerdict;
    warnings?: string[];
};

declare type SnapshotCaptureFreshness = {
    action: string;
    retryCount: number;
    staleAfterRetries: boolean;
    reason?: 'empty-interactive' | 'sharp-drop' | 'stuck-route';
};

declare type SnapshotDiagnosticsSummary = {
    stats: SnapshotTimingStats;
    warning?: string;
};

export declare type SnapshotNode = RawSnapshotNode & {
    ref: string;
};

/**
 * Structured quality verdict computed once by the iOS runner's snapshot capture plan.
 * The daemon renders it; it never re-derives degradation from node shapes.
 */
declare type SnapshotQualityVerdict = {
    state: 'healthy' | 'recovered' | 'sparse';
    backend: 'tree' | 'queries' | 'private-ax';
    reason?: string;
    reasonCode?: 'ax-rejected' | 'sparse-tree' | 'budget' | 'no-nodes' | 'capture-failed';
    effectiveDepth?: number;
    collapsedLeafIndexes?: number[];
};

declare type SnapshotTimingStats = {
    count: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
    slowThresholdMs: number;
    platform?: Platform;
    backends?: Record<string, number>;
};

declare type SnapshotUnchanged = {
    ageMs: number;
    nodeCount: number;
    interactiveOnly?: boolean;
    scope?: string;
};

export declare type SnapshotVisibility = {
    partial: boolean;
    visibleNodeCount: number;
    totalNodeCount: number;
    reasons: SnapshotVisibilityReason[];
};

export declare type SnapshotVisibilityReason = 'offscreen-nodes' | 'scroll-hidden-above' | 'scroll-hidden-below';

export declare type StartupPerfSample = {
    durationMs: number;
    measuredAt: string;
    method: string;
    appTarget?: string;
    appBundleId?: string;
};

declare const SWIPE_PATTERNS: readonly ['one-way', 'ping-pong'];

declare const SWIPE_PRESETS: readonly ['left', 'right', 'left-edge', 'right-edge'];

declare type SwipeGestureOptions = DeviceCommandBaseOptions & {
    preset: SwipePreset;
    durationMs?: number;
};

export declare type SwipeOptions = DeviceCommandBaseOptions & {
    from: {
        x: number;
        y: number;
    };
    to: {
        x: number;
        y: number;
    };
    durationMs?: number;
    count?: number;
    pauseMs?: number;
    pattern?: SwipePattern;
};

declare type SwipePattern = (typeof SWIPE_PATTERNS)[number];

declare type SwipePreset = (typeof SWIPE_PRESETS)[number];

export declare type TemporaryFile = {
    path: string;
    visibility: 'internal';
    cleanup: () => Promise<void>;
};

export declare type TraceOptions = AgentDeviceRequestOverrides & {
    action: 'start' | 'stop';
    path?: string;
};

declare type TransformGestureOptions = DeviceCommandBaseOptions & TransformGestureParams;

declare type TransformGestureParams = {
    x: number;
    y: number;
    dx: number;
    dy: number;
    scale: number;
    degrees: number;
    durationMs?: number;
};

export declare type TypeTextOptions = DeviceCommandBaseOptions & {
    text: string;
    delayMs?: number;
};

export declare type WaitCommandOptions = DeviceCommandBaseOptions & WaitCommandTarget;

export declare type WaitCommandResult = DaemonResponseData & {
    waitedMs?: number;
    text?: string;
    selector?: string;
};

declare type WaitCommandTarget = {
    durationMs: number;
    text?: never;
    ref?: never;
    selector?: never;
    timeoutMs?: never;
} | (SelectorSnapshotCommandOptions & {
    text: string;
    durationMs?: never;
    ref?: never;
    selector?: never;
    timeoutMs?: number;
}) | (SelectorSnapshotCommandOptions & {
    ref: string;
    durationMs?: never;
    text?: never;
    selector?: never;
    timeoutMs?: number;
}) | (SelectorSnapshotCommandOptions & {
    selector: string;
    durationMs?: never;
    text?: never;
    ref?: never;
    timeoutMs?: number;
});

export { }
