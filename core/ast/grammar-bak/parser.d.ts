declare class SyntaxError extends Error {
    expected: any;
    found: any;
    location: any;
    name: string;
    constructor(message: string, expected?: any, found?: any, location?: any);
}
declare function peg$DefaultTracer(): void;
declare function peg$parse(input: any, options: any): any;
declare const peg$allowedStartRules: string[];
export { peg$DefaultTracer as DefaultTracer, peg$allowedStartRules as StartRules, SyntaxError, peg$parse as parse };
declare const parser: {
    parse: typeof peg$parse;
    SyntaxError: typeof SyntaxError;
};
export default parser;
//# sourceMappingURL=parser.d.ts.map