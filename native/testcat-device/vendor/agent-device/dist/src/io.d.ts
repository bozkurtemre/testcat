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

export declare function createLocalArtifactAdapter(options?: LocalArtifactAdapterOptions): ArtifactAdapter;

export declare type CreateTempFileOptions = {
    prefix: string;
    ext: string;
};

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

export declare type LocalArtifactAdapterOptions = {
    cwd?: string;
    tempDir?: string;
    rootDir?: string;
};

export declare type OutputVisibility = 'client-visible' | 'internal';

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

export declare type ResolveInputOptions = {
    usage: string;
    field?: string;
};

export declare type TemporaryFile = {
    path: string;
    visibility: 'internal';
    cleanup: () => Promise<void>;
};

export { }
