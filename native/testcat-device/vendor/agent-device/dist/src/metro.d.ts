export declare function buildAndroidRuntimeHints(baseUrl: string): MetroRuntimeHints;

export declare function buildBundleUrl(baseUrl: string, platform: 'ios' | 'android'): string;

export declare function buildIosRuntimeHints(baseUrl: string): MetroRuntimeHints;

export declare type CompanionTunnelScope = {
    tenantId: string;
    runId: string;
    leaseId: string;
};

export declare function ensureMetroTunnel(options: EnsureMetroTunnelOptions): Promise<EnsureMetroTunnelResult>;

export declare type EnsureMetroTunnelOptions = {
    projectRoot: string;
    serverBaseUrl: string;
    bearerToken: string;
    localBaseUrl: string;
    bridgeScope: MetroBridgeScope;
    launchUrl?: string;
    profileKey?: string;
    consumerKey?: string;
    env?: EnvSource;
};

export declare type EnsureMetroTunnelResult = {
    pid: number;
    started: boolean;
    logPath: string;
};

declare type EnvSource = NodeJS.ProcessEnv | Record<string, string | undefined>;

export declare type MetroBridgeDescriptor = {
    enabled: boolean;
    base_url: string;
    status_url?: string;
    bundle_url?: string;
    ios_runtime: MetroBridgeRuntimePayload;
    android_runtime: MetroBridgeRuntimePayload;
    upstream: {
        bundle_url?: string;
        host?: string;
        port?: number;
        status_url?: string;
    };
    probe: {
        reachable: boolean;
        status_code: number;
        latency_ms: number;
        detail: string;
    };
};

export declare type MetroBridgeResult = {
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

export declare type MetroBridgeRuntimePayload = {
    metro_host?: string;
    metro_port?: number;
    metro_bundle_url?: string;
    launch_url?: string;
};

export declare type MetroBridgeScope = CompanionTunnelScope;

declare type MetroPrepareKind = 'auto' | 'react-native' | 'expo';

/** Re-export of {@link SessionRuntimeHints} under the Metro-specific alias used by public API consumers. */
export declare type MetroRuntimeHints = SessionRuntimeHints;

export declare type MetroTunnelHttpErrorMessage = {
    type: 'http-error';
    requestId: string;
    message: string;
};

export declare type MetroTunnelHttpRequestMessage = {
    type: 'http-request';
    requestId: string;
    method: string;
    path: string;
    headers?: Record<string, string>;
    bodyBase64?: string;
};

export declare type MetroTunnelHttpResponseMessage = {
    type: 'http-response';
    requestId: string;
    status: number;
    headers: Record<string, string>;
    bodyBase64?: string;
};

export declare type MetroTunnelMessage = MetroTunnelRequestMessage | MetroTunnelResponseMessage;

export declare type MetroTunnelPingMessage = {
    type: 'ping';
    timestamp: number;
};

export declare type MetroTunnelPongMessage = {
    type: 'pong';
    timestamp: number;
};

export declare type MetroTunnelRequestMessage = MetroTunnelPingMessage | MetroTunnelHttpRequestMessage | MetroTunnelWebSocketOpenMessage | MetroTunnelWebSocketFrameMessage | MetroTunnelWebSocketCloseMessage;

export declare type MetroTunnelResponseMessage = MetroTunnelPongMessage | MetroTunnelHttpResponseMessage | MetroTunnelHttpErrorMessage | MetroTunnelWebSocketOpenResultMessage | MetroTunnelWebSocketFrameMessage | MetroTunnelWebSocketCloseMessage;

export declare type MetroTunnelWebSocketCloseMessage = {
    type: 'ws-close';
    streamId: string;
    code?: number;
    reason?: string;
};

export declare type MetroTunnelWebSocketFrameMessage = {
    type: 'ws-frame';
    streamId: string;
    dataBase64: string;
    binary: boolean;
};

export declare type MetroTunnelWebSocketOpenMessage = {
    type: 'ws-open';
    streamId: string;
    path: string;
    headers?: Record<string, string>;
};

export declare type MetroTunnelWebSocketOpenResultMessage = {
    type: 'ws-open-result';
    streamId: string;
    success: boolean;
    headers?: Record<string, string>;
    error?: string;
};

export declare function normalizeBaseUrl(input: string): string;

export declare function prepareRemoteMetro(options: PrepareRemoteMetroOptions): Promise<PrepareRemoteMetroResult>;

export declare type PrepareRemoteMetroOptions = {
    projectRoot: string;
    kind: MetroPrepareKind;
    publicBaseUrl?: string;
    proxyBaseUrl?: string;
    proxyBearerToken?: string;
    bridgeScope?: MetroBridgeScope;
    launchUrl?: string;
    profileKey?: string;
    consumerKey?: string;
    port?: number;
    listenHost?: string;
    statusHost?: string;
    startupTimeoutMs?: number;
    probeTimeoutMs?: number;
    reuseExisting?: boolean;
    installDependenciesIfNeeded?: boolean;
    runtimeFilePath?: string;
    logPath?: string;
    env?: EnvSource;
};

export declare type PrepareRemoteMetroResult = {
    iosRuntime: MetroRuntimeHints;
    androidRuntime: MetroRuntimeHints;
    bridge: MetroBridgeResult | null;
    started: boolean;
    reused: boolean;
    logPath: string;
};

declare type ReloadMetroOptions = {
    metroHost?: string;
    metroPort?: number | string;
    bundleUrl?: string;
    runtime?: MetroRuntimeHints;
    timeoutMs?: number | string;
};

declare type ReloadMetroResult = {
    reloaded: true;
    reloadUrl: string;
    status: number;
    body: string;
};

export declare function reloadRemoteMetro(options?: ReloadRemoteMetroOptions): Promise<ReloadRemoteMetroResult>;

export declare type ReloadRemoteMetroOptions = ReloadMetroOptions;

export declare type ReloadRemoteMetroResult = ReloadMetroResult;

export declare function resolveRuntimeTransport(runtime: SessionRuntimeHints | undefined): {
    host: string;
    port: number;
    scheme: 'http' | 'https';
} | undefined;

declare type SessionRuntimeHints = {
    platform?: 'ios' | 'android';
    metroHost?: string;
    metroPort?: number;
    bundleUrl?: string;
    launchUrl?: string;
};

export declare function stopMetroTunnel(options: StopMetroTunnelOptions): Promise<void>;

export declare type StopMetroTunnelOptions = {
    projectRoot: string;
    profileKey?: string;
    consumerKey?: string;
};

export { }
