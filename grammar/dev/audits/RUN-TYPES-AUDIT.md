# Run Directive Types Audit

This document contains the results of auditing the run directive implementation and types in the Meld grammar.

## Current Implementation

The run directive is implemented in `/Users/adam/dev/meld/grammar/directives/run.peggy` with three main variants:

1. Run Code: `@run language [code]` - Executes a code block in a specific language
2. Run Command: `@run command` - Executes a shell command
3. Run Exec: `@run @commandVar` - Executes a previously defined command variable

It also includes a `RunDirectiveRef` rule for embedding run directives within other directives (RHS context).

## Current Type Definitions

The run directive is typed in `/Users/adam/dev/meld/grammar/types/run.ts` with these interfaces:

1. `RunDirectiveNode`: Base interface with kind 'run' and subtypes 'runCommand', 'runCode', or 'runExec'
2. `RunCommandDirectiveNode`: For shell commands with subtype 'runCommand'
3. `RunCodeDirectiveNode`: For code blocks with subtype 'runCode'
4. `RunExecDirectiveNode`: For command references with subtype 'runExec'

## Issues and Misalignments

### 1. Subtype Inconsistencies

**Grammar Implementation**:
- Uses subtypes: 'runCommand', 'runCode', 'runExec'

**Type Definitions**:
- Defines subtypes in `RunSubtype` type: 'runCommand' | 'runCode' | 'runExec'
- Matches implementation

**Core Types (directives.ts)**:
- Defines subtypes as: 'runCommand' | 'runDefined' | 'runCode' | 'runCodeParams'
- This is a mismatch with the implementation:
  - 'runDefined' vs. 'runExec' in implementation
  - 'runCodeParams' not used in implementation
  - No distinction in types for code with/without params

### 2. Value Structure Inconsistencies

**Grammar Implementation**:
- For 'runCode', uses `runCode.values` which contains:
  - `lang` (language identifier)
  - `args` (optional arguments for the code)
  - `code` (the actual code to execute)
- For 'runCommand', uses `command.values` which contains:
  - `command` (the shell command to execute)
- For 'runExec', creates values object with:
  - `identifier` (the command variable reference)
  - `args` (arguments to pass to the command)

**Type Definitions**:
- `RunValues` has all possible properties as optional: `command?`, `lang?`, `args?`, `code?`, `identifier?`
- Specific nodes like `RunCommandDirectiveNode` correctly specify required values
- `args` is typed as `VariableNodeArray[]` which doesn't match the implementation:
  - In the implementation, `args` in `AtRun` with command reference is an array of any node (not just variable nodes)
  - In `RunCommandArg`, it creates text nodes for string literals 

### 3. Raw Value Structure

**Grammar Implementation**:
- For 'runCode', uses `runCode.raw` with properties like `lang`, `args`, `code`
- For 'runCommand', uses `command.raw` with property `command`
- For 'runExec', creates raw object with `identifier` and `args`

**Type Definitions**:
- `RunRaw` interface in run.ts has all the possible properties as optional
- The specific node interfaces (`RunCommandDirectiveNode`, etc.) define more specific raw objects
- This generally aligns with implementation, but the structures in specific nodes don't exactly match the ones created in the implementation

### 4. Metadata Inconsistencies

**Grammar Implementation**:
- For 'runCommand', adds metadata with `isMultiLine: command.raw.command.includes('\n')`
- For 'runCode', uses `runCode.meta` directly
- For 'runExec', adds `argumentCount` metadata
- For RHS references, adds `isRHSRef: true` flag

**Type Definitions**:
- `RunMeta` only defines `isMultiLine?: boolean` and `argumentCount?: number`
- Missing the `isRHSRef` property used in RHS context
- Missing any code-specific metadata that might come from `runCode.meta`

### 5. Source Attribute Usage

**Grammar Implementation**:
- 'runCode' sets source to 'code'
- 'runCommand' sets source to 'command'
- 'runExec' sets source to 'exec'
- RunDirectiveRef doesn't set a source

**Type Definitions**:
- No explicit handling for the source attribute
- Implementation-defined source types are not documented or typed anywhere

## Recommendations

Based on the audit, here are recommendations for improving type alignment:

1. **Align Subtype Definitions**:
   - Update core.syntax.types.directives.ts to match implementation:
   ```typescript
   export type DirectiveSubtype = 
     ...
     | 'runCommand' | 'runCode' | 'runExec'
     ...
   ```

2. **Update Arguments Type**:
   - Change `args` in `RunValues` to handle mixed content:
   ```typescript
   export interface RunValues {
     // ...
     args?: Array<TextNode | VariableReferenceNode>;
     // ...
   }
   ```

3. **Enhance Metadata Interface**:
   - Update `RunMeta` to reflect all metadata properties:
   ```typescript
   export interface RunMeta {
     isMultiLine?: boolean;
     argumentCount?: number;
     isRHSRef?: boolean;
     language?: string;       // For code execution
     hasVariables?: boolean;  // Whether content contains variables
   }
   ```

4. **Standardize Source Attribute**:
   - Add explicit typing for source attribute:
   ```typescript
   export type RunSource = 'command' | 'code' | 'exec';
   
   export interface RunDirectiveNode extends TypedDirectiveNode<'run', RunSubtype> {
     // ...
     source: RunSource;
   }
   ```

5. **Update RunCodeDirectiveNode**:
   - Make args optional to match implementation:
   ```typescript
   export interface RunCodeDirectiveNode extends RunDirectiveNode {
     // ...
     values: {
       lang: TextNodeArray;
       code: ContentNodeArray;
       args?: Array<TextNode | VariableReferenceNode>;
     };
     // ...
   }
   ```

6. **Handle RHS Context**:
   - Add specific type for RHS context run directives:
   ```typescript
   export interface RHSRunDirectiveNode extends RunDirectiveNode {
     meta: RunMeta & {
       isRHSRef: true;
     }
   }
   ```

7. **Improve Type Guards**:
   - Add type guard for checking RHS context:
   ```typescript
   export function isRHSRunDirective(node: RunDirectiveNode): boolean {
     return node.meta.isRHSRef === true;
   }
   ```

## Next Steps

1. Document these findings in the comprehensive types audit report
2. Prioritize these changes for implementation after the audit phase
3. Consider creating test cases that validate the structure of AST nodes against their type definitions