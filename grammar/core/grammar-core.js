"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.helpers = exports.DirectiveKind = exports.NodeType = void 0;
exports.NodeType = {
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
exports.DirectiveKind = {
    run: 'run',
    add: 'add',
    text: 'text',
    exec: 'exec',
    data: 'data',
    path: 'path',
    import: 'import',
};
exports.helpers = {
    debug: function (msg) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        if (process.env.DEBUG_MELD_GRAMMAR)
            console.log.apply(console, __spreadArray(['[DEBUG GRAMMAR]', msg], args, false));
    },
    isLogicalLineStart: function (input, pos) {
        if (pos === 0)
            return true;
        var i = pos - 1;
        while (i >= 0 && ' \t\r'.includes(input[i]))
            i--;
        return i < 0 || input[i] === '\n';
    },
    createNode: function (type, props) {
        var _a;
        return Object.freeze(__assign({ type: type, nodeId: 'placeholder-id', location: (_a = props.location) !== null && _a !== void 0 ? _a : { start: { offset: 0, line: 1, column: 1 },
                end: { offset: 0, line: 1, column: 1 } } }, props));
    },
    createDirective: function (kind, data) {
        // Legacy method maintained for backward compatibility
        return this.createNode(exports.NodeType.Directive, { directive: __assign({ kind: kind }, data) });
    },
    // New method for creating directives with the updated structure
    createStructuredDirective: function (kind, subtype, values, raw, meta, locationData, source) {
        if (source === void 0) { source = null; }
        return this.createNode(exports.NodeType.Directive, {
            kind: kind,
            subtype: subtype,
            source: source,
            values: values,
            raw: raw,
            meta: meta
        }, locationData);
    },
    createVariableReferenceNode: function (valueType, data) {
        return this.createNode(exports.NodeType.VariableReference, __assign({ valueType: valueType, isVariableReference: true }, data));
    },
    normalizePathVar: function (id) {
        if (id === '~')
            return 'HOMEPATH';
        if (id === '.')
            return 'PROJECTPATH';
        return id;
    },
    validateRunContent: function () { return true; },
    validateDefineContent: function () { return true; },
    validatePath: function (pathParts, directiveKind) {
        // 1. Reconstruct Raw String (needed for output)
        var raw = this.reconstructRawString(pathParts).trim();
        // Initialize flags
        var hasVariables = false;
        // Process path parts
        if (pathParts && pathParts.length > 0) {
            for (var _i = 0, pathParts_1 = pathParts; _i < pathParts_1.length; _i++) {
                var node = pathParts_1[_i];
                if (node.type === exports.NodeType.VariableReference) {
                    hasVariables = true;
                }
            }
        }
        // 3. Construct Final Flags Object
        var finalFlags = {
            hasVariables: hasVariables
        };
        // 4. Construct Result Object
        var result = __assign({ raw: raw, values: pathParts }, finalFlags);
        this.debug('PATH', 'validatePath final result:', JSON.stringify(result, null, 2));
        return result;
    },
    getImportSubtype: function (list) {
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
    trace: function (pos, reason) {
        // Placeholder - No output for now
        // this.debug('TRACE', `Reject @${pos}: ${reason}`);
    },
    reconstructRawString: function (nodes) {
        // Basic implementation - iterates nodes and concatenates
        if (!Array.isArray(nodes)) {
            // Handle cases where a single node might be passed (though likely expects array)
            if (nodes && typeof nodes === 'object') {
                if (nodes.type === exports.NodeType.Text)
                    return nodes.content || '';
                if (nodes.type === exports.NodeType.VariableReference) {
                    // Handle different variable types with appropriate syntax
                    var varId = nodes.identifier;
                    var valueType = nodes.valueType;
                    // Variable syntax handling:
                    // - 'varInterpolation' for {{var}} (in strings)
                    // - 'varIdentifier' for @var (direct reference)
                    if (valueType === 'varInterpolation') {
                        return "{{".concat(varId, "}}");
                    }
                    else if (valueType === 'varIdentifier') {
                        return "@".concat(varId);
                    }
                    else {
                        // Default case - should not happen with consistent valueTypes
                        return "{{".concat(varId, "}}");
                    }
                }
            }
            return String(nodes || ''); // Fallback
        }
        // For path or command, construct a clean string without extra characters
        var raw = '';
        for (var _i = 0, nodes_1 = nodes; _i < nodes_1.length; _i++) {
            var node = nodes_1[_i];
            if (!node)
                continue;
            if (node.type === exports.NodeType.Text) {
                raw += node.content || '';
            }
            else if (node.type === exports.NodeType.VariableReference) {
                var varId = node.identifier;
                var valueType = node.valueType;
                // Use the same variable syntax handling logic as above
                if (valueType === 'varInterpolation') {
                    raw += "{{".concat(varId, "}}");
                }
                else if (valueType === 'varIdentifier') {
                    raw += "@".concat(varId);
                }
                else {
                    // Default case - should not happen with consistent valueTypes
                    raw += "{{".concat(varId, "}}");
                }
            }
            else if (node.type === exports.NodeType.PathSeparator) {
                raw += node.value || ''; // Append '/' or '.'
            }
            else if (node.type === exports.NodeType.SectionMarker) {
                raw += node.value || ''; // Append '#'
            }
            else if (node.type === exports.NodeType.StringLiteral) {
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
