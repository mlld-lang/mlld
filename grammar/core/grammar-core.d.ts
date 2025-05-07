export declare const NodeType: {
    readonly Text: "Text";
    readonly Comment: "Comment";
    readonly CodeFence: "CodeFence";
    readonly VariableReference: "VariableReference";
    readonly Directive: "Directive";
    readonly PathSeparator: "PathSeparator";
    readonly DotSeparator: "DotSeparator";
    readonly Literal: "Literal";
    readonly SectionMarker: "SectionMarker";
    readonly Error: "Error";
    readonly Newline: "Newline";
    readonly StringLiteral: "StringLiteral";
};
export type NodeTypeKey = keyof typeof NodeType;
export declare const DirectiveKind: {
    readonly run: "run";
    readonly add: "add";
    readonly text: "text";
    readonly exec: "exec";
    readonly data: "data";
    readonly path: "path";
    readonly import: "import";
};
export type DirectiveKindKey = keyof typeof DirectiveKind;
export declare const helpers: {
    debug(msg: string, ...args: unknown[]): void;
    isLogicalLineStart(input: string, pos: number): boolean;
    createNode<T extends object>(type: NodeTypeKey, props: T & {
        location?: any;
    }): Readonly<{
        type: "Text" | "Comment" | "CodeFence" | "VariableReference" | "Directive" | "PathSeparator" | "DotSeparator" | "Literal" | "SectionMarker" | "Error" | "Newline" | "StringLiteral";
        nodeId: "placeholder-id";
        location: any;
    } & T & {
        location?: any;
    }>;
    createDirective(kind: DirectiveKindKey, data: any): Readonly<{
        type: "Text" | "Comment" | "CodeFence" | "VariableReference" | "Directive" | "PathSeparator" | "DotSeparator" | "Literal" | "SectionMarker" | "Error" | "Newline" | "StringLiteral";
        nodeId: "placeholder-id";
        location: any;
    } & {
        directive: any;
    } & {
        location?: any;
    }>;
    createStructuredDirective(kind: DirectiveKindKey, subtype: string, values: any, raw: string, meta: any, locationData: any, source?: any): Readonly<{
        type: "Text" | "Comment" | "CodeFence" | "VariableReference" | "Directive" | "PathSeparator" | "DotSeparator" | "Literal" | "SectionMarker" | "Error" | "Newline" | "StringLiteral";
        nodeId: "placeholder-id";
        location: any;
    } & {
        kind: "run" | "add" | "text" | "exec" | "data" | "path" | "import";
        subtype: string;
        source: any;
        values: any;
        raw: string;
        meta: any;
        location: any;
    } & {
        location?: any;
    }>;
    createVariableReferenceNode(valueType: string, data: any): Readonly<any>;
    normalizePathVar(id: string): string;
    validateRunContent: () => boolean;
    validateDefineContent: () => boolean;
    validatePath(pathParts: any[], directiveKind?: string): {
        hasVariables: boolean;
        raw: any;
        values: any[];
    };
    getImportSubtype(list: any[] | null): "importAll" | "importSelected";
    trace(pos: number, reason: string): void;
    reconstructRawString(nodes: any[] | any): any;
};
//# sourceMappingURL=grammar-core.d.ts.map