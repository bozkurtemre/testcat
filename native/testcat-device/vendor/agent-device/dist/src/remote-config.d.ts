declare const DAEMON_SERVER_MODES: readonly ['socket', 'http', 'dual'];

declare const DAEMON_TRANSPORT_PREFERENCES: readonly ['auto', 'socket', 'http'];

declare type DaemonServerMode = (typeof DAEMON_SERVER_MODES)[number];

declare type DaemonTransportPreference = (typeof DAEMON_TRANSPORT_PREFERENCES)[number];

declare const DEVICE_TARGETS: readonly ['mobile', 'tv', 'desktop'];

declare type DeviceTarget = (typeof DEVICE_TARGETS)[number];

declare const LEASE_BACKENDS: readonly ['ios-simulator', 'ios-instance', 'android-instance'];

declare type LeaseBackend = (typeof LEASE_BACKENDS)[number];

declare type MetroPrepareKind = 'auto' | 'react-native' | 'expo';

declare const PLATFORM_SELECTORS: readonly ["ios", "macos", "android", "linux", "apple"];

declare type PlatformSelector = (typeof PLATFORM_SELECTORS)[number];

declare type RemoteConfigMetroOptions = {
    metroProjectRoot?: string;
    metroKind?: MetroPrepareKind;
    metroPublicBaseUrl?: string;
    metroProxyBaseUrl?: string;
    metroBearerToken?: string;
    metroPreparePort?: number;
    metroListenHost?: string;
    metroStatusHost?: string;
    metroStartupTimeoutMs?: number;
    metroProbeTimeoutMs?: number;
    metroRuntimeFile?: string;
    metroNoReuseExisting?: boolean;
    metroNoInstallDeps?: boolean;
};

export declare type RemoteConfigProfile = RemoteConfigMetroOptions & {
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
    platform?: PlatformSelector;
    target?: DeviceTarget;
    device?: string;
    udid?: string;
    serial?: string;
    iosSimulatorDeviceSet?: string;
    androidDeviceAllowlist?: string;
    session?: string;
};

export declare type RemoteConfigProfileOptions = {
    configPath: string;
    cwd: string;
    env?: Record<string, string | undefined>;
};

export declare type ResolvedRemoteConfigProfile = {
    resolvedPath: string;
    profile: RemoteConfigProfile;
};

export declare function resolveRemoteConfigPath(options: RemoteConfigProfileOptions): string;

export declare function resolveRemoteConfigProfile(options: RemoteConfigProfileOptions): ResolvedRemoteConfigProfile;

declare const SESSION_ISOLATION_MODES: readonly ['none', 'tenant'];

declare type SessionIsolationMode = (typeof SESSION_ISOLATION_MODES)[number];

export { }
