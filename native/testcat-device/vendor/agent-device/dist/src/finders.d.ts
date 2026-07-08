declare const FIND_LOCATORS: readonly ['any', 'text', 'label', 'value', 'role', 'id'];

declare type FindAction = {
    kind: 'click';
} | {
    kind: 'focus';
} | {
    kind: 'fill';
    value: string;
} | {
    kind: 'type';
    value: string;
} | {
    kind: 'get_text';
} | {
    kind: 'get_attrs';
} | {
    kind: 'exists';
} | {
    kind: 'wait';
    timeoutMs?: number;
};

export declare function findBestMatchesByLocator(nodes: SnapshotNode[], locator: FindLocator, query: string, options?: boolean | FindMatchOptions): {
    matches: SnapshotNode[];
    score: number;
};

export declare type FindLocator = (typeof FIND_LOCATORS)[number];

export declare type FindMatchOptions = {
    requireRect?: boolean;
};

export declare function normalizeRole(value: string): string;

export declare function normalizeText(value: string): string;

export declare function parseFindArgs(args: string[]): {
    locator: FindLocator;
    query: string;
    action: FindAction['kind'];
    value?: string;
    timeoutMs?: number;
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

declare type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export declare type SnapshotNode = RawSnapshotNode & {
    ref: string;
};

export { }
