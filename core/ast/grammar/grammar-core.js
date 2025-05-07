export const NodeType = {
    Text: 'Text',
    Comment: 'Comment',
    CodeFence: 'CodeFence',
    VariableReference: 'VariableReference',
    Directive: 'Directive',
    PathSeparator: 'PathSeparator',
    DotSeparator: 'DotSeparator',
    Literal: 'Literal',
    SectionMarker: 'SectionMarker',
    Error: 'Error',
    Newline: 'Newline',
    StringLiteral: 'StringLiteral', // Added missing type
};
export const DirectiveKind = {
    run: 'run',
    add: 'add',
    text: 'text',
    exec: 'exec',
    data: 'data',
    path: 'path',
    import: 'import',
};
export const helpers = {
    debug(msg, ...args) {
        if (process.env.DEBUG_MELD_GRAMMAR)
            console.log('[DEBUG GRAMMAR]', msg, ...args);
    },
    isLogicalLineStart(input, pos) {
        if (pos === 0)
            return true;
        let i = pos - 1;
        while (i >= 0 && ' \t\r'.includes(input[i]))
            i--;
        return i < 0 || input[i] === '\n';
    },
    createNode(type, props) {
        return Object.freeze({
            type,
            nodeId: 'placeholder-id',
            location: props.location ?? { start: { offset: 0, line: 1, column: 1 },
                end: { offset: 0, line: 1, column: 1 } },
            ...props,
        });
    },
    createDirective(kind, data) {
        // Legacy method maintained for backward compatibility
        return this.createNode(NodeType.Directive, { directive: { kind, ...data } });
    },
    // New method for creating directives with the updated structure
    createStructuredDirective(kind, subtype, values, raw, meta, locationData, source = null) {
        return this.createNode(NodeType.Directive, {
            kind,
            subtype,
            source,
            values,
            raw,
            meta,
            location: locationData
        });
    },
    createVariableReferenceNode(valueType, data) {
        return this.createNode(NodeType.VariableReference, { valueType, isVariableReference: true, ...data });
    },
    normalizePathVar(id) {
        if (id === '~')
            return 'HOMEPATH';
        if (id === '.')
            return 'PROJECTPATH';
        return id;
    },
    validateRunContent: () => true,
    validateDefineContent: () => true,
    validatePath(pathParts, directiveKind) {
        // 1. Reconstruct Raw String (needed for output)
        const raw = this.reconstructRawString(pathParts).trim();
        // Initialize flags
        let hasVariables = false;
        // Process path parts
        if (pathParts && pathParts.length > 0) {
            for (const node of pathParts) {
                if (node.type === NodeType.VariableReference) {
                    hasVariables = true;
                }
            }
        }
        // 3. Construct Final Flags Object
        const finalFlags = {
            hasVariables: hasVariables
        };
        // 4. Construct Result Object
        const result = {
            raw: raw,
            values: pathParts,
            ...finalFlags
        };
        this.debug('PATH', 'validatePath final result:', JSON.stringify(result, null, 2));
        return result;
    },
    getImportSubtype(list) {
        // Check for importAll: [*]
        if (!list)
            return 'importAll';
        if (list.length === 0)
            return 'importAll'; // Empty list `[]` from `[...]` => importAll
        if (list.length === 1 && list[0].name === '*')
            return 'importAll';
        // Otherwise, it's importSelected
        return 'importSelected';
    },
    trace(pos, reason) {
        // Placeholder - No output for now
        // this.debug('TRACE', `Reject @${pos}: ${reason}`);
    },
    reconstructRawString(nodes) {
        // Basic implementation - iterates nodes and concatenates
        if (!Array.isArray(nodes)) {
            // Handle cases where a single node might be passed (though likely expects array)
            if (nodes && typeof nodes === 'object') {
                if (nodes.type === NodeType.Text)
                    return nodes.content || '';
                if (nodes.type === NodeType.VariableReference) {
                    // Handle different variable types with appropriate syntax
                    const varId = nodes.identifier;
                    const valueType = nodes.valueType;
                    // Variable syntax handling:
                    // - 'varInterpolation' for {{var}} (in strings)
                    // - 'varIdentifier' for @var (direct reference)
                    if (valueType === 'varInterpolation') {
                        return `{{${varId}}}`;
                    }
                    else if (valueType === 'varIdentifier') {
                        return `@${varId}`;
                    }
                    else {
                        // Default case - should not happen with consistent valueTypes
                        return `{{${varId}}}`;
                    }
                }
            }
            return String(nodes || ''); // Fallback
        }
        // For path or command, construct a clean string without extra characters
        let raw = '';
        for (const node of nodes) {
            if (!node)
                continue;
            if (node.type === NodeType.Text) {
                raw += node.content || '';
            }
            else if (node.type === NodeType.VariableReference) {
                const varId = node.identifier;
                const valueType = node.valueType;
                // Use the same variable syntax handling logic as above
                if (valueType === 'varInterpolation') {
                    raw += `{{${varId}}}`;
                }
                else if (valueType === 'varIdentifier') {
                    raw += `@${varId}`;
                }
                else {
                    // Default case - should not happen with consistent valueTypes
                    raw += `{{${varId}}}`;
                }
            }
            else if (node.type === NodeType.PathSeparator) {
                raw += node.value || ''; // Append '/' or '.'
            }
            else if (node.type === NodeType.SectionMarker) {
                raw += node.value || ''; // Append '#'
            }
            else if (node.type === NodeType.StringLiteral) {
                // Handle string literals properly - avoids adding extra quotes
                raw += node.value || '';
            }
            else if (typeof node === 'string') {
                // Handle potential raw string segments passed directly
                raw += node;
            }
            else {
                // Fallback for other node types or structures
                // Use content or value directly instead of raw to avoid extra characters
                raw += node.content || node.value || node.raw || '';
            }
        }
        return raw;
    },
};
