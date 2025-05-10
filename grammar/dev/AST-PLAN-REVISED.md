# Strategic Type System Design Using the AST Explorer

This document explains how to use the AST Explorer we've created to implement a clean-slate type system that perfectly aligns with the AST produced by the Meld grammar.

## Design Principles

1. **AST-First Design**: Base all types directly on the actual AST structure
2. **Strong Type Safety**: Leverage TypeScript's advanced type features for precise typing
3. **Consistency**: Create uniform patterns across all directives
4. **Discoverability**: Make types self-documenting and intuitive
5. **Modularity**: Design for easy extension and maintenance

## Implementation Using AST Explorer

### Step 1: Generate AST Snapshots

First, create AST snapshots for all directive variants:

```bash
# Navigate to the grammar directory
cd /Users/adam/dev/meld/grammar

# Initialize an examples file if you don't have one
./explorer/src/command.ts init explorer/examples/all-directives.json

# Edit the examples file to include all directive variants
# Then process the examples
./explorer/src/command.ts batch explorer/examples/all-directives.json -o generated
```

This will generate:
- AST snapshots in `generated/snapshots/`
- Initial TypeScript interfaces in `generated/types/`
- Test fixtures in `generated/fixtures/`
- Documentation in `generated/docs/`

### Step 2: Analyze the AST Structure

Review the generated snapshots and documentation to understand the exact structure of each directive:

```bash
# Explore a specific directive's AST
./explorer/src/command.ts explore '@text greeting = "Hello, world!"'

# Compare different variants
cat generated/snapshots/text-assignment.snapshot.json
cat generated/snapshots/text-template.snapshot.json
```

The documentation in `generated/docs/` provides a comprehensive overview of all directive types and their structures.

### Step 3: Refine the Type System Architecture

Based on the AST Explorer output, implement the layered type architecture:

#### 1. Base Types Layer

Create a `types/base.ts` file with the fundamental types:

```typescript
// Import directly from the generated types or adapt them:
import { DirectiveNode } from '../grammar/explorer/generated/types';

// Define base node types
export type NodeType = 
  | 'Directive'
  | 'Text'
  | 'VariableReference'
  | 'Number'
  | 'PathSeparator'
  | 'DotSeparator';

export type DirectiveKind = 
  | 'text' 
  | 'run' 
  | 'add' 
  | 'import'
  | 'path'
  | 'data'
  | 'exec';

// The foundation for all nodes
export interface Node {
  readonly nodeId: string;
  type: NodeType;
  location?: SourceLocation;
}

// Base directive structure that all directives follow
export interface DirectiveNode<K extends DirectiveKind, S extends string> extends Node {
  type: 'Directive';
  kind: K;
  subtype: S;
  values: Record<string, Node[]>;
  raw: Record<string, string | string[]>;
  meta: Record<string, unknown>;
  source?: string;
}
```

#### 2. Value Types Layer

Create a `types/values.ts` file with common value types:

```typescript
import { TextNode, VariableReferenceNode, PathSeparatorNode, DotSeparatorNode } from './base';

// Standardized array types used throughout the system
export type ContentNodeArray = Array<TextNode | VariableReferenceNode>;
export type PathNodeArray = Array<TextNode | PathSeparatorNode | DotSeparatorNode | VariableReferenceNode>;
export type IdentifierNodeArray = Array<VariableReferenceNode>;
```

#### 3. Directive-Specific Types Layer

Create files for each directive type, using the generated interfaces as a starting point:

```typescript
// text-directive.ts - Adapt from explorer/generated/types/text-*.ts
import { DirectiveNode } from './base';
import { ContentNodeArray, IdentifierNodeArray } from './values';

export type TextSubtype = 'textAssignment' | 'textTemplate';
export type TextSource = 'literal' | 'template' | 'directive' | 'run' | 'add';

export interface TextMeta {
  sourceType: TextSource;
  hasVariables?: boolean;
  isTemplateContent?: boolean;
  // Add other metadata properties from snapshots
}

export interface TextDirectiveNode extends DirectiveNode<'text', TextSubtype> {
  values: {
    identifier: IdentifierNodeArray;
    content: ContentNodeArray | DirectiveNode<any, any>;
  };
  raw: {
    identifier: string;
    content: string;
  };
  meta: TextMeta;
  source: TextSource;
}

// Add specific subtype interfaces and type guards
```

### Step 4: Automate Type Generation with the Explorer

Create a script to automate the type generation process:

```bash
# Use the explorer's generate-types script
npm run --prefix grammar/explorer generate-types
```

Or integrate it into your build process:

```typescript
// build-grammar.mjs - Add after parser generation
import { Explorer } from './explorer/src/explorer';

// Generate types
const explorer = new Explorer({
  outputDir: path.join(__dirname, 'types/generated')
});
explorer.processBatch(path.join(__dirname, 'explorer/examples/directives.json'));
console.log('✓ Type definitions generated');
```

### Step 5: Implement Type Guards and Utilities

Add type guards and utility functions based on the AST structure:

```typescript
// Type guard example for a directive
export function isTextDirective(node: any): node is TextDirectiveNode {
  return node?.type === 'Directive' && node?.kind === 'text';
}

// Type guard for a specific subtype
export function isTextTemplate(node: any): node is TextTemplateNode {
  return isTextDirective(node) && node.subtype === 'textTemplate';
}
```

### Step 6: Test Type Coverage

Use the generated test fixtures to verify your type system:

```typescript
// Example test using the generated fixtures
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast/grammar/parser';
import { isTextDirective, isTextTemplate } from '../types/text-directive';

describe('Text directive types', () => {
  it('should correctly type a text assignment directive', () => {
    const directive = '@text greeting = "Hello, world!"';
    const result = parse(directive)[0];
    
    expect(isTextDirective(result)).toBe(true);
    expect(isTextTemplate(result)).toBe(false);
  });
});
```

## Directory Structure

```
grammar/
  explorer/             # AST Explorer tool
    src/                # Source code
    examples/           # Directive examples
    generated/          # Generated files
      snapshots/        # AST snapshots
      types/            # Generated TypeScript interfaces
      fixtures/         # Test fixtures
      docs/             # Documentation
  
  types/                # Final type system
    index.ts            # Main exports
    base.ts             # Foundational node types
    values.ts           # Common value structures
    meta.ts             # Metadata type definitions
    
    directives/         # Directive-specific types
      text.ts
      run.ts
      add.ts
      import.ts
      path.ts
      data.ts
      exec.ts
    
    utils/              # Type utilities and guards
      guards.ts
      assertions.ts
      transformations.ts
```

## Workflow for Adding New Directive Types

When adding a new directive or variant:

1. Add an example to `explorer/examples/directives.json`
2. Run the batch process to generate snapshots and initial types:
   ```bash
   ./explorer/src/command.ts batch explorer/examples/directives.json -o generated
   ```
3. Review the generated snapshot and types
4. Incorporate the new types into your type system
5. Add appropriate type guards and tests

## Benefits of This Approach

1. **AST-Driven Development**: Types are directly generated from the actual AST
2. **Automatic Updates**: When grammar changes, regenerate types to stay in sync
3. **Comprehensive Documentation**: Auto-generated docs with examples
4. **Test Coverage**: Generated test fixtures ensure type alignment
5. **Developer Productivity**: Reduce manual type creation and maintenance

## Example: Adding a New Directive Variant

To add a new variant of an existing directive:

1. Add the example to `explorer/examples/directives.json`:
   ```json
   {
     "name": "text-with-run",
     "directive": "@text greeting = @run echo \"Hello\"",
     "description": "Text directive with nested run command"
   }
   ```

2. Generate the snapshots and types:
   ```bash
   ./explorer/src/command.ts batch explorer/examples/directives.json -o generated
   ```

3. Review the generated output to understand the AST structure
4. Update your type definitions to accommodate the new variant
5. Add tests to verify the typing

By following this process, you can maintain perfect alignment between your grammar implementation and type system.