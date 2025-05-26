# Text Directive Types Audit

This document contains the results of auditing the text directive implementation and types in the Mlld grammar.

## Current Implementation

The text directive is implemented in `/Users/adam/dev/mlld/grammar/directives/text.peggy` with several variants:

1. Text Assignment with `@add` directive: `@text id = @add [path]`
2. Text Assignment with template: `@text id = content` (can be a template or literal)
3. Text Assignment with `@run` command: `@text id = @run command`
4. Text Assignment with `@run` code: `@text id = @run language [code]`
5. Text Assignment with `@run` command reference: `@text id = @run @commandRef`
6. Text Assignment with `@add` directive reference: `@text id = @add path`

## Current Type Definitions

The text directive is typed in `/Users/adam/dev/mlld/grammar/types/text.ts` with these main interfaces:

1. `TextDirectiveNode`: Base interface with kind 'text' and subtype 'textAssignment' or 'textTemplate'
2. `TextAssignmentDirectiveNode`: Extending TextDirectiveNode with subtype 'textAssignment'
3. `TextTemplateDirectiveNode`: Extending TextDirectiveNode with subtype 'textTemplate'

## Issues and Misalignments

### 1. Subtype Inconsistencies

**Grammar Implementation**:
- Uses subtypes: 'textAssignment', 'textTemplate'
- Determines subtype based on template detection

**Type Definitions**:
- Defined subtypes in `TextDirectiveNode`: 'textAssignment' | 'textTemplate' 
- Matches implementation

**Core Types (directives.ts)**:
- Defines subtypes as 'textVariable' | 'textTemplate'
- This is a mismatch with the implementation which uses 'textAssignment'

### 2. Source Attribute Inconsistencies

**Grammar Implementation**:
- Sets `sourceType` in meta and source fields to: 'directive', 'literal', 'template', 'run', 'add'
- For nested directives, specifies the source as the nested directive type

**Type Definitions**:
- `TextValues` has `source?: string` with comment saying it can be 'literal', 'embed', 'run', or 'directive'
- This doesn't align perfectly with the implementation which uses 'template' (not listed in types)
- Implementation uses 'add' but types list 'embed' (rename inconsistency)

### 3. Raw Value Structure Inconsistencies

**Grammar Implementation**:
- Creates raw values with `identifier` and `content` properties
- Content is a string representing the raw text of the directive

**Type Definitions**:
- `TextRaw` interface in raw.ts only has `variable: string` and `format?: string`
- This doesn't match the actual implementation which uses `identifier` and `content`
- `TextAssignmentDirectiveNode` and `TextTemplateDirectiveNode` define their own raw interfaces that don't match `TextRaw`

### 4. Meta Information Inconsistencies

**Grammar Implementation**:
- Uses metadata fields:
  - `sourceType`: The type of content source
  - `hasVariables`: Whether the content contains variable interpolations
  - `isTemplateContent`: Whether the content uses template syntax
  - `directive`: For nested directives, specifies the directive type
  - Directive-specific metadata (e.g., `run` object for run directives)

**Type Definitions**:
- `TextMeta` in meta.ts is essentially empty, just extends DirectiveMeta
- This doesn't reflect the rich metadata used in the implementation

### 5. Content Value Structure

**Grammar Implementation**:
- For templates, uses template.values.content (array of nodes)
- For @run command, uses command.values.command (array of nodes)
- For @run code, uses runCode.values.code (array of nodes) 
- For @add, uses either a simple text node array or a reference to the addPath directive node

**Type Definitions**:
- Properly handles content as `ContentNodeArray | DirectiveNode`
- This is aligned with the implementation

## Recommendations

Based on the audit, here are recommendations for improving type alignment:

1. **Align Subtype Definitions**:
   - Update core.syntax.types.directives.ts to use 'textAssignment' instead of 'textVariable' for consistency with implementation

2. **Update Raw Interface**:
   - Create a more accurate `TextRaw` interface in raw.ts:
   ```typescript
   export interface TextRaw {
     identifier: string;
     content: string;
   }
   ```

3. **Enhance Meta Interface**:
   - Update `TextMeta` to reflect actual metadata used:
   ```typescript
   export interface TextMeta extends DirectiveMeta {
     sourceType: 'directive' | 'literal' | 'template' | 'run' | 'add';
     hasVariables?: boolean;
     isTemplateContent?: boolean;
     directive?: 'run' | 'add'; // For nested directives
     // Directive-specific metadata
     run?: {
       isCommand?: boolean;
       isCommandRef?: boolean;
       commandName?: string;
       language?: string;
       isMultiLine?: boolean;
     };
     add?: Record<string, unknown>;
     path?: PathMeta;
   }
   ```

4. **Align Source Type Constants**:
   - Standardize the directiveSource constants between grammar implementation and types
   - Change 'embed' to 'add' in types to match implementation

5. **Simplify Nested Structure Detection**:
   - Enhance the type guards to better detect nested structures
   - Consider adding specific type guards for each supported nested directive type

6. **Documentation Improvement**:
   - Add detailed JSDoc comments explaining the purpose of each field and their possible values
   - Document the relationship between text directive and nested directives

## Next Steps

1. Document these findings in the comprehensive types audit report
2. Prioritize these changes for implementation after the audit phase
3. Consider creating a migration plan for renaming 'embed' to 'add' consistently if needed