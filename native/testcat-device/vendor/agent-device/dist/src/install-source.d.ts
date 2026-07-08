export declare const ARCHIVE_EXTENSIONS: readonly [".zip", ".tar", ".tar.gz", ".tgz"];

export declare function isBlockedIpAddress(address: string): boolean;

export declare function isBlockedSourceHostname(hostname: string): boolean;

export declare function isTrustedInstallSourceUrl(sourceUrl: string | URL): boolean;

export declare type MaterializedInstallable = {
    archivePath?: string;
    installablePath: string;
    cleanup: () => Promise<void>;
};

declare type MaterializeInstallableOptions = {
    source: MaterializeInstallSource;
    isInstallablePath: (candidatePath: string, stat: {
        isFile(): boolean;
        isDirectory(): boolean;
    }) => boolean;
    installableLabel: string;
    allowArchiveExtraction?: boolean;
    signal?: AbortSignal;
    downloadTimeoutMs?: number;
};

export declare function materializeInstallablePath(options: MaterializeInstallableOptions): Promise<MaterializedInstallable>;

export declare type MaterializeInstallSource = {
    kind: 'url';
    url: string;
    headers?: Record<string, string>;
} | {
    kind: 'path';
    path: string;
};

export declare function validateDownloadSourceUrl(parsedUrl: URL): Promise<void>;

export { }
