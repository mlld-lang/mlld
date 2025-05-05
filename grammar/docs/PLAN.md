# AST Values Object Refactoring Implementation Plan

> **IMPORTANT DIRECTIVE RENAMING**: As part of this refactoring, we are also implementing a consistent naming convention:
> - All variable-storing directives will be four-letter nouns: 
>   - `text` (already implemented)
>   - `path` (already implemented)
>   - `data` (already implemented)
>   - `exec` (renamed from "define") - not yet implemented
> - All action-performing directives will be three-letter verbs:
>   - `add` (renamed from "embed") - in progress
>   - `run` (already a three-letter verb) - not yet implemented
> 
> This renaming will require changes throughout the codebase but will create a more consistent and intuitive API.

This document outlines the process for refactoring the `DirectiveNode` structure to use a structured object approach instead of a flat array, along with comprehensive type definitions that support recursive directive nesting.

## Goal

Create a robust, strongly-typed AST structure for Meld directives that:

1. Provides clear semantic grouping of related nodes
2. Preserves raw text for each semantic group
3. Captures relevant metadata
4. Enforces type safety through comprehensive type definitions
5. Supports recursive directive nesting for composability
6. Is well-documented for future maintenance

## Current Status

- Import directive: Grammar implementation complete, documentation and tests complete ✅
- Text directive: Grammar implementation complete, documentation, tests, and nested directive support complete ✅
- Data directive: Type definitions and documentation complete, basic nested directive support implemented, object/array nesting planned ✅
- Path directive: Grammar implementation complete, documentation and tests complete ✅
- Add directive (renamed from `embed`): Grammar implementation complete, documentation and tests complete ✅
- Run directive: Grammar implementation complete, testing complete ✅
- Exec directive (renamed from `define`): Grammar implementation complete, testing complete ✅

We are currently progressing through Phase 5 (Grammar Implementation) with both core directive support and directive nesting features. 

Current implementation notes:
- All directives have been implemented to use the new structured format in their grammar files (import, text, data, path, add, run, exec)
- The run directive has been updated to use the structured format with proper handling of commands, code blocks, and variable references
- The exec directive has been renamed from define and fully implemented with the structured format
- Tests verify the correct structured format is being produced for all directives
- Upon rebuilding the grammar, all directives correctly use the structured format
- Next steps involve updating handlers to use the new structured format

## Implementation Structure

We're implementing this refactoring using a structured approach:

```
/grammar
  /docs                   # Documentation by directive/subtype
  /directives             # Peggy grammar files
  /types                  # TypeScript type definitions
  /fixtures               # Test fixtures and examples
  /tests                  # Test implementation
```

All components are organized by directive kind, then by subtype for clarity and separation of concerns.

## Implementation Requirements for Each Directive

To fully implement a directive in the new structured format, we need to complete these deliverables:

1. **Documentation**
   - Overview document (`kind.md`) explaining purpose and AST structure
   - Subtype-specific documents (`kind.subtype.md`) for each variant
   - Example AST structures showing the new format

2. **Types**
   - Base interfaces for the directive (`{Kind}DirectiveNode`)
   - Subtype interfaces (`{Subtype}DirectiveNode`)
   - Value, raw, and metadata type definitions
   - Type guards for runtime type checking

3. **Tests**
   - Comprehensive tests for all syntax variations
   - Tests that specifically verify the structured format
   - Tests for edge cases and special handling

4. **Grammar**
   - Updated grammar rules to generate the structured format
   - Proper capture of raw text for each semantic group
   - Metadata calculation and inclusion

5. **Handlers**
   - Updated handlers to use the new structure
   - Type assertions to ensure type safety
   - Utilization of the structured access patterns

## Implementation Process

### Phase 1: Planning and Conversation

For each directive, we'll have a structured conversation to define:

1. All possible syntax variations
2. The exact structure of the values object
3. The specific node types that appear in each value array
4. The raw text segments that need to be captured
5. The metadata that should be derived and stored

### Phase 2: Documentation

Based on the conversation, we'll create:

1. A directive overview document (`kind.md`)
2. Subtype-specific documents (`kind.subtype.md`) for each variant
3. Example AST outputs for typical use cases

### Phase 3: Type Definition

Implement strong typing with:

1. Base node interfaces that all nodes extend
2. Directive-specific type definitions
3. Subtype-specific interfaces with exact property requirements
4. Type guards for runtime type checking
5. Type exports for reuse in tests and elsewhere

### Phase 4: Test Fixtures

Create comprehensive test fixtures:

1. Input examples for all syntax variations
2. Expected AST output with exact type structure
3. Edge cases and special handling scenarios

### Phase 5: Grammar Implementation

Update the grammar files to:

1. Capture raw text segments alongside parsed nodes
2. Construct the values object with the right node arrays
3. Build the raw object with captured text segments
4. Add metadata based on the input
5. Return a properly structured directive node

### Phase 6: Testing and Verification

Run comprehensive tests to:

1. Verify the grammar produces the expected AST structure
2. Confirm type compatibility with the defined interfaces
3. Check edge cases and error handling
4. Ensure backward compatibility where needed

### Phase 7: Handler Updates

Finally, update directive handlers to:

1. Use the new structure and type definitions
2. Access specific node groups via the values object
3. Utilize raw text and metadata where appropriate
4. Add type assertions for safety

## Structured AST Format

For each directive, we implement a consistent structured AST format with the following structure:

```typescript
{
  type: 'Directive',
  kind: string,              // e.g., 'embed', 'text', 'path'
  subtype: string,           // e.g., 'embedPath', 'textAssignment'
  values: {                  // Structured node arrays for each semantic group
    [key: string]: NodeArray // e.g., path, content, variable, etc.
  },
  raw: {                     // Raw text for reconstruction
    [key: string]: string    // Matches keys in values
  },
  meta: {                    // Metadata specific to directive
    [key: string]: any       // e.g., path.isAbsolute, isTemplateContent
  }
}
```

This consistent structure makes directive nodes more semantically meaningful and easier to work with:
- `values` contains parsed node arrays organized by semantic group
- `raw` preserves original text for each group to support reconstruction
- `meta` provides derived information like whether a path is absolute

## Directive Implementation Order

We'll implement the directives in this order, from simplest to most complex:

1. Import ✅
2. Text ✅ 
3. Path ✅
4. Data ✅
5. Embed (to be renamed to `add`) ✅
6. Run
7. Define (to be renamed to `exec`)

## Conversation Schedule

For each directive, we'll have a structured conversation covering:

1. **Directive Overview**
   - Purpose and general usage
   - Current implementation assessment
   - Key challenges and considerations

2. **Syntax Analysis**
   - All valid syntax forms
   - Detailed breakdown of components
   - Identification of semantic groups

3. **AST Structure Definition**
   - Required keys in values object
   - Node types for each key
   - Raw text capture requirements
   - Metadata derivation

4. **Edge Cases & Special Handling**
   - Unusual syntax variations
   - Error handling considerations
   - Backward compatibility needs

## Current Status

- Import directive: Grammar implementation complete, documentation and tests complete ✅
- Text directive: Grammar implementation complete, documentation, tests, and nested directive support complete ✅
- Data directive: Type definitions and documentation complete, basic nested directive support implemented, object/array nesting planned ✅
- Path directive: Grammar implementation complete, documentation and tests complete ✅
- Embed directive (to be renamed to `add`): Grammar implementation complete, documentation and tests complete ✅
- Run directive: Grammar implementation complete, documentation and tests complete ✅
- Exec directive (renamed from `define`): Grammar implementation complete, documentation and tests complete ✅

We are currently progressing through Phase 5 (Grammar Implementation) with both core directive support and directive nesting features. 

Current implementation notes:
- All directives are properly implemented to use the new structured format in their grammar files
- We are fully transitioning to the new structured format only and no longer supporting the legacy format
- Tests now exclusively verify the new structured format is correct
- All handlers will need to be updated to use the new structured format

## Implementation Checklist

### Import Directive

- [x] Have structured conversation about AST structure
- [x] Create overview documentation (import.md)
- [x] Create subtype documentation (import.importAll.md, import.importSelected.md)
- [x] Define type interfaces (directives.ts, nodes.ts)
- [x] Create test fixtures (import.ts)
- [x] Update grammar implementation (import.peggy)
- [x] Run and verify tests (import.test.ts)
- [ ] Update handlers to use new structure

### Text Directive

- [x] Have structured conversation about AST structure
- [x] Create overview documentation (text.md)
- [x] Create subtype documentation (text.textAssignment.md, text.textTemplate.md)
- [x] Define type interfaces with directive nesting support (text.ts)
- [x] Create test fixtures (nested-text-directives.test.ts)
- [x] Update grammar implementation (text.peggy)
- [x] Implement nested directive support (@text var = @embed/run) ✅
- [x] Run and verify tests with nested directives
- [ ] Update handlers to use new structure with nested directives

### Data Directive

- [x] Have structured conversation about AST structure
- [x] Create overview documentation (data.md)
- [x] Define type interfaces with recursive structure (data.ts)
- [x] Create test fixtures (directive-nesting.test.ts)
- [x] Implement basic directive nesting in grammar (@data var = @embed/run) ✅
- [ ] Implement object property nesting (@data var = { "prop": @embed })
- [ ] Implement array item nesting (@data var = [ @embed ])
- [ ] Update handlers to use new structure with nested directives

### Path Directive

- [x] Have structured conversation about AST structure
- [x] Create overview documentation (path.md)
- [x] Create subtype documentation (path.pathAssignment.md)
- [x] Define type interfaces (path.ts)
- [x] Create test fixtures (path.test.ts)
- [x] Update grammar implementation (path.peggy) with structured format
- [x] Run and verify tests with new structured format
- [x] Ensure parser generates correct structured format
- [ ] Update handlers to use new structure

The path directive implementation includes:
- Values: `identifier` (variable reference node) and `path` (array of path nodes)
- Raw: `identifier` (string) and `path` (raw string)
- Meta: Path metadata including `isAbsolute`, `hasVariables`, etc.

### Embed Directive (to be renamed to `add`)

- [x] Have structured conversation about AST structure
- [x] Create overview documentation (embed.md)
- [x] Create subtype documentation (embed.embedPath.md, embed.embedTemplate.md, embed.embedVariable.md, embed.embedMultiline.md)
- [x] Define type interfaces (embed.ts)
- [x] Create test fixtures (embed.test.ts)
- [x] Update grammar implementation (embed.peggy) with structured format
- [x] Run and verify tests with new structured format
- [x] Ensure parser generates correct structured format
- [ ] Rename to `add` directive with all related files and references
- [ ] Update handlers to use new structure

The embed (soon to be `add`) directive implementation includes these structures:

**embedPath** (to be renamed to `addPath`):
- Values: `path` (array of path nodes), `section` (optional text nodes), `headerLevel` (optional number node), `underHeader` (optional text nodes)
- Raw: `path` (string), `section` (optional string), `headerLevel` (optional string), `underHeader` (optional string)
- Meta: Path metadata including `isAbsolute`, `hasVariables`, etc.

**embedTemplate** (to be renamed to `addTemplate`):
- Values: `content` (array of text/variable nodes), `headerLevel` (optional), `underHeader` (optional)
- Raw: `content` (string), `headerLevel` (optional), `underHeader` (optional)
- Meta: `isTemplateContent: true`

**embedVariable** (to be renamed to `addVariable`):
- Values: `variable` (array with variable reference node), `headerLevel` (optional), `underHeader` (optional)
- Raw: `variable` (string), `headerLevel` (optional), `underHeader` (optional)
- Meta: (empty object)

### Run Directive Implementation Plan

Based on our detailed design conversations, we've agreed on these implementation details for the run directive:

#### Run Directive Subtypes

1. **runCommand** - Basic shell command execution
   ```
   @run [command --with parameters]
   ```
   
   Multi-line commands use the same bracket syntax:
   ```
   @run [
     command --with parameters
     | pipe to next command
   ]
   ```

2. **runCode** - Code execution in a specific language
   ```
   @run javascript [
   // JavaScript code here
   ]
   ```

3. **runExec** - Execute a previously defined command (from exec directive)
   ```
   @run @commandName (arg1, arg2)
   ```
   
   Note: The space between command name and arguments is optional but preferred in documentation.

#### Run Values Object Structure

For each subtype, the values object will be structured as follows:

**runCommand**:
- Values: `command` (ContentNodeArray) - Array of text/variable nodes for command content
- Raw: `command` (string) - Raw text of command
- Meta: `isMultiLine` (boolean) - Whether this is a multi-line command

**runCode**:
- Values: 
  - `lang` (TextNodeArray) - Language identifier
  - `args` (VariableNodeArray[]) - Array of argument arrays, may be empty
  - `code` (ContentNodeArray) - Code content
- Raw:
  - `lang` (string) - Raw language name
  - `args` (string[]) - Raw argument strings, may be empty array
  - `code` (string) - Raw code text
- Meta:
  - `isMultiLine` (boolean) - Whether this is a multi-line code block

**runExec**:
- Values:
  - `identifier` (TextNodeArray) - Reference to the defined command
  - `args` (VariableNodeArray[]) - Array of argument arrays, may be empty
- Raw:
  - `identifier` (string) - Raw command name
  - `args` (string[]) - Raw argument strings, may be empty array
- Meta:
  - `argumentCount` (number) - Number of provided arguments

### Exec Directive Implementation Plan

For the exec directive (renamed from define), we'll implement:

#### Exec Directive Subtypes

1. **execCommand** - Define a shell command that can be executed via runExec
   ```
   @exec commandName = @run [command]
   ```

2. **execCode** - Define a code snippet in a specific language that can be executed via runExec
   ```
   @exec commandName = @run javascript [ code ]
   @exec commandName (param1, param2) = @run python [ print("Hello", param1, param2) ]
   ```
   
   Note: The space between command name and parameters is optional but preferred in documentation.

Both subtypes will support parameters using the same structure.

#### Exec Values Object Structure

**execCommand**:
- Values:
  - `identifier` (TextNodeArray) - Command name
  - `params` (VariableNodeArray[]) - Parameter placeholders, may be empty
  - `metadata` (TextNodeArray, optional) - Metadata information (risk, about, etc.)
  - `command` (ContentNodeArray) - Command content
- Raw:
  - `identifier` (string) - Raw command name
  - `params` (string[]) - Raw parameter names, may be empty array 
  - `metadata` (string, optional) - Raw metadata string
  - `command` (string) - Raw command string
- Meta:
  - `parameterCount` (number) - Number of parameters
  - `metadata` (object, optional) - Structured metadata information (future implementation)

**execCode**:
- Values:
  - `identifier` (TextNodeArray) - Command name
  - `params` (VariableNodeArray[]) - Parameter placeholders, may be empty
  - `metadata` (TextNodeArray, optional) - Metadata information
  - `lang` (TextNodeArray) - Language identifier
  - `code` (ContentNodeArray) - Code content
- Raw:
  - `identifier` (string) - Raw command name
  - `params` (string[]) - Raw parameter names, may be empty array 
  - `metadata` (string, optional) - Raw metadata string
  - `lang` (string) - Raw language name
  - `code` (string) - Raw code text
- Meta:
  - `parameterCount` (number) - Number of parameters
  - `metadata` (object, optional) - Structured metadata information (future implementation)

#### Implementation Notes:

1. **Consistent Naming**:
   - Using `identifier` consistently across directives that store variables (text, data, path, exec)
   - Using `args` for arguments passed to commands in runExec and runCode
   - Using `params` for parameters defined in execCommand and execCode

2. **Metadata Handling**:
   - Renamed `field` to `metadata` for clarity and descriptiveness
   - Postponed implementation of detailed risk levels for later phases
   - Will implement a structured metadata object in the future for risk, about, and meta fields

3. **RunExec UX**:
   - From a UX perspective, runExec doesn't need to know whether it's executing code or a shell command
   - This provides a clean, intuitive interface for users where they just reference command names
   - Internal handlers will determine the right execution strategy based on how the command was defined

### Run Directive Implementation Checklist

- [x] Have structured conversation about AST structure
- [x] Create overview documentation (run.md)
- [x] Create subtype documentation (runCommand.md, runCode.md, runExec.md)
- [x] Define type interfaces (run.ts) with appropriate values, raw, and meta structures
- [x] Create test fixtures for each subtype
- [x] Update grammar implementation (run.peggy) with structured format
- [x] Run and verify tests with new structured format
- [x] Ensure parser generates correct structured format
- [ ] Update handlers to use new structure

### Exec Directive Implementation Checklist

- [x] Have structured conversation about AST structure
- [x] Create overview documentation (exec.md)
- [x] Create subtype documentation (execCommand.md, execCode.md)
- [x] Define type interfaces (exec.ts) with appropriate values, raw, and meta structures
- [x] Create test fixtures for each subtype
- [x] Update grammar implementation (exec.peggy) with structured format
- [x] Run and verify tests with new structured format
- [x] Ensure parser generates correct structured format
- [ ] Update handlers to use new structure

## Universal @variable Syntax Implementation Plan

As part of our syntax simplification strategy, we're adopting a universal `@variable` syntax across all directives. This will make `@` the central signifier for variable usage throughout Meld.

### Key Changes

1. **String Interpolation**: Keep `{{mustache}}` syntax exclusively for interpolation inside strings
2. **Direct References**: Use `@variable` syntax for direct references (in commands, paths, etc.)
3. **Plain Text Handling**: `@xyz` inside strings is treated as plain text (not interpolated)

### Implementation Plan by File

#### 1. variables.peggy

- Update `Variable` rule to include both `InterpolationVar` ({{var}}) and `AtVar` (@var)
- Create `InterpolationVar` rule for mustache syntax in strings:
  ```javascript
  "{{" _ id:Identifier ... _ "}}" {
    // Create node with valueType 'interpolation'
    return helpers.createVariableReferenceNode('interpolation', {
      identifier: id,
      ...
    }, location());
  }
  ```
- Create `AtVar` rule for @ syntax outside strings:
  ```javascript
  "@" id:Identifier ... {
    // Create node with valueType 'variable'  
    return helpers.createVariableReferenceNode('variable', {
      identifier: id,
      ...
    }, location());
  }
  ```
- Add special handling for path special characters (`@.`, `@~`, etc.)
- Interpreter will determine the actual variable type at runtime

#### 2. interpolation.peggy

- Update `PathAllowedChar` rule to handle @ as potential variable marker:
  ```javascript
  !('"' / "'" / '`' / '{{' / '/' / '\\') char:. { return char; }
  ```
- Update `BracketLiteralTextSegment` rule to handle @ variables:
  ```javascript
  value:$(!(']' / '{{') .)+ { 
    return helpers.createNode(NodeType.Text, { content: value }, location());
  }
  ```
- Update string content rules to handle Variable nodes (which now include AtVar)

#### 3. run.peggy

- Update `runExec` rule to use `@commandName` instead of `$commandName`:
  ```javascript
  "run" _ varRef:AtVar _ args:RunExecArgs? ...
  ```
- Update `CommandReference` rule to match AtVar instead of $ syntax
- Modify raw string reconstruction for variables:
  ```javascript
  if (n.type === 'VariableReference') {
    return n.valueType === 'interpolation' ? `{{${n.identifier}}}` : `@${n.identifier}`;
  }
  ```
- Update variable reference creation to use 'variable' type

#### 4. exec.peggy

- Similar updates to run.peggy for command references
- Update `ExecParam` rule to use new variable reference type:
  ```javascript
  return helpers.createVariableReferenceNode('variable', { identifier: paramName }, location());
  ```
- Update raw string reconstruction to use @ format

#### 5. path.peggy

- Update path variable references to use `@var` instead of `$var`
- Update path validation to recognize @ variables
- Modify raw string reconstruction for path variables

### Testing Updates

- Update all relevant test cases to expect @ syntax for variable references
- Ensure string interpolation tests still use {{mustache}} syntax
- Verify command references use @ syntax
- Test path variable references with @ syntax
- Verify AST structure is correct with new valueType property values

### Benefits

The universal `@variable` syntax will:
1. Provide a cleaner, more consistent syntax across all directives
2. Make `@` the central signifier for all variable references
3. Allow the interpreter to determine variable type at runtime based on context
4. Maintain the benefits of mustache syntax for string interpolation
5. Simplify grammar rules and variable handling

## Grammar Implementation Guidelines

This section provides detailed guidelines for implementing the run and exec directive grammar files with the new structured format.

### Development Environment Setup

1. **Build the Grammar**:
   ```bash
   npm run build:grammar
   ```
   This step is essential after any grammar changes to generate the updated parser.

2. **Run Tests**:
   ```bash
   npm test grammar/tests/run.test.ts
   npm test grammar/tests/exec.test.ts
   ```
   These commands will verify your grammar implementation against the test fixtures.

### Run Directive Grammar Implementation

Follow these steps when implementing the run.peggy file:

1. **Structure the Rules**:
   - Create separate rules for each subtype (runCommand, runCode, runExec)
   - Use helper rules for shared functionality (argument parsing, etc.)

2. **runCommand Subtype**:
   - Capture command content using BracketInterpolatableContent
   - Build raw string by joining node content
   - Set isMultiLine metadata based on content (check for newlines)
   - Structure as:
     ```
     values: { command: ContentNodeArray }
     raw: { command: string }
     meta: { isMultiLine: boolean }
     ```

3. **runCode Subtype**:
   - Capture language identifier, arguments, and code content
   - Handle both with and without arguments
   - Structure as:
     ```
     values: { 
       lang: TextNodeArray,
       args: VariableNodeArray[],
       code: ContentNodeArray
     }
     raw: {
       lang: string,
       args: string[],
       code: string
     }
     meta: { isMultiLine: boolean }
     ```

4. **runExec Subtype**:
   - Parse command reference with optional arguments
   - Make whitespace between identifier and arguments optional
   - Structure as:
     ```
     values: {
       identifier: TextNodeArray,
       args: VariableNodeArray[]
     }
     raw: {
       identifier: string,
       args: string[]
     }
     meta: { argumentCount: number }
     ```

5. **Helper Functions**:
   - Use createStructuredDirective() instead of createDirective()
   - Calculate raw strings using helper.reconstructRawString() or similar

### Exec Directive Grammar Implementation

Follow these steps when implementing the exec.peggy file:

1. **Structure the Rules**:
   - Create separate rules for each subtype (execCommand, execCode)
   - Use helper rules for metadata and parameter parsing

2. **execCommand Subtype**:
   - Parse identifier, optional metadata field, and parameters
   - Capture command content from the @run directive
   - Structure as:
     ```
     values: {
       identifier: TextNodeArray,
       params: VariableNodeArray[],
       metadata?: TextNodeArray,
       command: ContentNodeArray
     }
     raw: {
       identifier: string,
       params: string[],
       metadata?: string,
       command: string
     }
     meta: {
       parameterCount: number,
       metadata?: { type?: string }
     }
     ```

3. **execCode Subtype**:
   - Parse identifier, metadata, parameters, language, and code content
   - Structure as:
     ```
     values: {
       identifier: TextNodeArray,
       params: VariableNodeArray[],
       metadata?: TextNodeArray,
       lang: TextNodeArray,
       code: ContentNodeArray
     }
     raw: {
       identifier: string,
       params: string[],
       metadata?: string,
       lang: string,
       code: string
     }
     meta: {
       parameterCount: number,
       metadata?: { type?: string }
     }
     ```

4. **Parameter Handling**:
   - Support optional parameters with proper whitespace handling
   - Convert parameter identifiers to VariableNodeArray

5. **Metadata Parsing**:
   - Parse risk levels and other metadata fields
   - Structure metadata in a consistent format for future expansion

### Common Implementation Patterns

1. **Node Creation**:
   ```javascript
   return {
     type: 'Directive',
     kind: 'run',  // or 'exec'
     subtype: 'runCommand',  // or other subtype
     values: {
       // Structured content nodes
     },
     raw: {
       // Raw text strings
     },
     meta: {
       // Metadata flags and values
     }
   };
   ```

2. **Raw Text Capture**:
   ```javascript
   const rawCommand = content.map(n => {
     if (n.type === 'Text') return n.content;
     if (n.type === 'VariableReference') {
       // Use mustache syntax for interpolation variables
       return n.valueType === 'interpolation' ? `{{${n.identifier}}}` : `@${n.identifier}`;
     }
     return '';
   }).join('');
   ```

3. **Parameter/Argument Transformation**:
   ```javascript
   const paramNodes = params.map(paramName => 
     helpers.createVariableReferenceNode('variable', { identifier: paramName }, location())
   );
   ```

### Testing and Troubleshooting

1. **Verify AST Structure**:
   - The generated AST must match the expected structure in test fixtures
   - Pay attention to values, raw, and meta objects

2. **Debug Grammar Issues**:
   - Use conditional logging with helpers.debug() to trace execution
   - Check input text patterns against rules with tools like pegjs-online

3. **Common Issues**:
   - Variable reference format in raw strings
   - Whitespace handling in multi-line content
   - Object structure consistency

By following these guidelines, you'll ensure a correct and consistent implementation of the run and exec directive grammar with the new structured format.

### Remaining Directives

- [ ] Continue with structured conversations for each additional directive
- [ ] Complete documentation, testing and implementation for each

## Next Potential Actions

1. Update directive handlers to use the new structures
2. Complete data directive grammar implementation for object and array nesting
3. Continue with path directive implementation
4. Consider cross-directive interoperability patterns
5. Enhance validation for nested directives

## Directive Nesting Implementation Stages

For comprehensive directive nesting, we're implementing in stages:

1. **Basic Nesting (Complete)** ✅ - Direct nesting of directives at the top level:
   ```
   @text content = @embed "file.txt"
   @data config = @embed "config.json" 
   ```
   - Implementation notes: We chose to store nested directives directly in the `values.content` field for text directives and `values.value` field for data directives, rather than in arrays. This enables direct access to the nested directive. For text directives, we also set a `source: 'directive'` flag to indicate the content comes from a nested directive.

2. **Object Property Nesting (Planned)** - Directives as object properties:
   ```
   @data dashboard = {
     "content": @embed "file.md",
     "stats": @run [command]
   }
   ```
   - Initial grammar rules were implemented but require further refinement. Tests have been created but are currently skipped.
   
3. **Array Item Nesting (Planned)** - Directives as array items:
   ```
   @data results = [
     @embed "file1.json",
     @embed "file2.json"
   ]
   ```
   - Grammar rules need to be updated to support this pattern. Tests have been created but are currently skipped.

4. **Mixed Nesting (Planned)** - Complex structures with directives at multiple levels:
   ```
   @data config = {
     "reports": [
       @embed "report1.json",
       {
         "content": @run [generate-report],
         "timestamp": "2025-05-05"
       }
     ]
   }
   ```
   - This will be implemented after object property and array item nesting are working correctly.

## Benefits of This Approach

This structured approach ensures:

1. **Precision**: Clearly defined types reduce ambiguity
2. **Maintainability**: Documentation stays tied to implementation
3. **Testability**: Comprehensive fixtures verify correctness
4. **Extensibility**: New subtypes can follow the established pattern
5. **Clarity**: Separation by directive and subtype improves organization