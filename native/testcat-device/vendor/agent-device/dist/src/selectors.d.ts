export declare function findSelectorChainMatch(nodes: SnapshotState['nodes'], chain: SelectorChain, options: {
    platform: Platform;
    requireRect?: boolean;
}): {
    selectorIndex: number;
    selector: Selector;
    matches: number;
    diagnostics: SelectorDiagnostics[];
} | null;

export declare function formatSelectorFailure(chain: SelectorChain, diagnostics: SelectorDiagnostics[], options: {
    unique?: boolean;
}): string;

export declare function isNodeEditable(node: SnapshotNode, platform: Platform): boolean;

export declare function isNodeVisible(node: SnapshotNode): boolean;

export declare function isSelectorToken(token: string): boolean;

export declare function parseSelectorChain(expression: string): SelectorChain;

declare type Platform = (typeof PLATFORMS)[number];

declare const PLATFORMS: readonly ['ios', 'macos', 'android', 'linux'];

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

export declare function resolveSelectorChain(nodes: SnapshotState['nodes'], chain: SelectorChain, options: {
    platform: Platform;
    requireRect?: boolean;
    requireUnique?: boolean;
    disambiguateAmbiguous?: boolean;
}): SelectorResolution | null;

export declare type Selector = {
    raw: string;
    terms: SelectorTerm[];
};

export declare type SelectorChain = {
    raw: string;
    selectors: Selector[];
};

export declare type SelectorDiagnostics = {
    selector: string;
    matches: number;
};

declare type SelectorKey = 'id' | 'role' | 'text' | 'label' | 'value' | 'appname' | 'windowtitle' | 'visible' | 'hidden' | 'editable' | 'selected' | 'enabled' | 'hittable';

export declare type SelectorResolution = {
    node: SnapshotNode;
    selector: Selector;
    selectorIndex: number;
    matches: number;
    diagnostics: SelectorDiagnostics[];
};

declare type SelectorTerm = {
    key: SelectorKey;
    value: string | boolean;
};

declare type SnapshotBackend = 'xctest' | 'android' | 'macos-helper' | 'linux-atspi';

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

declare type SnapshotState = {
    nodes: SnapshotNode[];
    createdAt: number;
    truncated?: boolean;
    backend?: SnapshotBackend;
    snapshotQuality?: SnapshotQualityVerdict;
    comparisonSafe?: boolean;
    presentationKey?: string;
};

export declare function tryParseSelectorChain(expression: string): SelectorChain | null;

export { }
