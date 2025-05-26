"use strict";
/**
 * Mlld Parser Entry Point
 *
 * Provides the main parsing functionality for Mlld documents.
 * Re-exports the generated parser and related types.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyntaxError = exports.parser = void 0;
exports.parse = parse;
exports.parseSync = parseSync;
// Import the generated parser
const parser_js_1 = __importDefault(require("./parser.js"));
exports.parser = parser_js_1.default;
/**
 * Parse Mlld source code into an AST
 *
 * @param source The Mlld source code to parse
 * @param options Parser options
 * @returns The parsed AST nodes
 * @throws {SyntaxError} If the source code is invalid
 */
async function parse(source, options) {
    try {
        const ast = parser_js_1.default.parse(source, {
            startRule: 'Start',
            ...options
        });
        return {
            ast,
            success: true
        };
    }
    catch (error) {
        return {
            ast: [],
            success: false,
            error: error instanceof Error ? error : new Error(String(error))
        };
    }
}
/**
 * Synchronous parse function for compatibility
 */
function parseSync(source, options) {
    return parser_js_1.default.parse(source, {
        startRule: 'Start',
        ...options
    });
}
exports.SyntaxError = parser_js_1.default.SyntaxError;
//# sourceMappingURL=index.js.map