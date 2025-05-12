# AST Explorer Examples

This document demonstrates how to set up a convention-based directory structure for AST Explorer and the resulting output.

## Directory Structure

The AST Explorer uses a standardized directory structure to organize examples by directive kind and subtype:

```
core/examples/
├── text/                    # Directive kind: text
│   ├── assignment/          # Subtype: assignment
│   │   ├── example.md       # Base example
│   │   ├── expected.md      # Expected output (optional)
│   │   ├── example-multiline.md  # Variant example
│   │   └── expected-multiline.md # Variant expected output
│   └── template/            # Subtype: template
│       ├── example.md
│       └── expected.md
├── run/                     # Directive kind: run
│   ├── command/             # Subtype: command
│   │   ├── example.md
│   │   └── expected.md
│   └── code/                # Subtype: code
│       ├── example.md
│       └── example-async.md
└── import/                  # Directive kind: import
    ├── all/                 # Subtype: all
    │   └── example.md
    └── selected/            # Subtype: selected
        └── example.md
```

## Example Content

Here are examples of what files might contain:

### text/assignment/example.md
```
@text greeting = "Hello, world!"
```

### text/assignment/expected.md
```
Hello, world!
```

### text/assignment/example-multiline.md
```
@text greeting = "Hello,
world!"
```

### run/command/example.md
```
@run echo "Testing the command"
```

### import/selected/example.md
```
@import { componentA, componentB } from "./components.meld"
```

## Generated Output

When you run the enhanced type generation with `npm run ast:enhanced`, it produces the following structure:

```
core/ast/
├── types/                  # TypeScript type definitions
│   ├── base-node.ts        # Base types for all nodes
│   ├── base-directive.ts   # Base directive interfaces
│   ├── base-variable.ts    # Base variable interfaces
│   ├── values.ts           # Value type definitions
│   ├── directives.ts       # Main union type
│   ├── text.ts             # Text directive union
│   ├── run.ts              # Run directive union
│   ├── import.ts           # Import directive union
│   ├── text-assignment.ts  # Specific directive interface
│   ├── text-template.ts    # Specific directive interface
│   ├── run-command.ts      # Specific directive interface
│   ├── run-code.ts         # Specific directive interface
│   ├── import-all.ts       # Specific directive interface
│   ├── import-selected.ts  # Specific directive interface
│   └── index.ts            # Exports all types
├── snapshots/              # AST snapshots for regression testing
│   ├── text-assignment.json
│   ├── text-assignment-multiline.json
│   ├── text-template.json
│   ├── run-command.json
│   ├── run-code.json
│   ├── run-code-async.json
│   ├── import-all.json
│   └── import-selected.json
└── tests/                  # Test fixtures
    ├── text-assignment.fixture.ts
    ├── text-assignment-multiline.fixture.ts
    ├── text-template.fixture.ts
    ├── run-command.fixture.ts
    ├── run-code.fixture.ts
    ├── run-code-async.fixture.ts
    ├── import-all.fixture.ts
    └── import-selected.fixture.ts
```

## Type Generation Output

The enhanced type generation creates a hierarchical type system with proper discriminated unions:

### types/directives.ts
```typescript
import { TextDirectiveNode } from './text.js';
import { RunDirectiveNode } from './run.js';
import { ImportDirectiveNode } from './import.js';

/**
 * Union type for all directive nodes
 */
export type DirectiveNodeUnion = 
  | TextDirectiveNode
  | RunDirectiveNode
  | ImportDirectiveNode;
```

### types/text.ts
```typescript
import { TextAssignmentDirectiveNode } from './text-assignment.js';
import { TextTemplateDirectiveNode } from './text-template.js';

/**
 * Union type for all text directive nodes
 */
export type TextDirectiveNode = 
  | TextAssignmentDirectiveNode
  | TextTemplateDirectiveNode;
```

### types/text-assignment.ts
```typescript
import { BaseDirectiveNode, TypedDirectiveNode } from './base-directive.js';
import { ContentNodeArray, VariableNodeArray } from './values.js';

/**
 * TextAssignmentDirectiveNode - text directive with assignment subtype
 */
export interface TextAssignmentDirectiveNode extends TypedDirectiveNode<'text', 'assignment'> {
  values: {
    name: string;
    value: string;
  };

  raw: {
    name: string;
    value: string;
  };

  meta: {
    hasDynamicContent: boolean;
  };
}

/**
 * Type guard for TextAssignmentDirectiveNode
 */
export function isTextAssignmentDirectiveNode(node: BaseDirectiveNode): node is TextAssignmentDirectiveNode {
  return node.kind === 'text' && node.subtype === 'assignment';
}
```

## Using the Generated Types

Here's how to use the generated types in your code:

```typescript
import { DirectiveNodeUnion, TextDirectiveNode, isTextAssignmentDirectiveNode } from './core/ast/types';

function processAst(node: DirectiveNodeUnion) {
  // Check if it's a text directive
  if (node.kind === 'text') {
    const textNode = node as TextDirectiveNode;
    
    // Using discriminated union
    if (textNode.subtype === 'assignment') {
      const name = textNode.values.name;
      const value = textNode.values.value;
      // Process text assignment...
    } else if (textNode.subtype === 'template') {
      const template = textNode.values.template;
      const variables = textNode.values.variables;
      // Process text template...
    }
  }
  
  // Or using type guards
  if (isTextAssignmentDirectiveNode(node)) {
    // TypeScript knows this is a TextAssignmentDirectiveNode
    const name = node.values.name;
    // Process text assignment...
  }
}
```

## E2E Test Fixtures

For examples with expected outputs, the AST Explorer generates E2E test fixtures that can be used in tests:

### e2e/text-assignment.fixture.json
```json
{
  "name": "text-assignment",
  "input": "@text greeting = \"Hello, world!\"",
  "expected": "Hello, world!",
  "directives": [
    "@text greeting = \"Hello, world!\""
  ],
  "metadata": {
    "kind": "text",
    "subtype": "assignment"
  }
}
```

You can use these fixtures in your tests to verify that parsing and transformation work correctly:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDirective } from '../src/parse';
import { transformDirective } from '../src/transform';

describe('E2E directive tests', () => {
  it('should process text assignment correctly', () => {
    // Load fixture
    const fixture = JSON.parse(
      readFileSync(join(__dirname, '../e2e/text-assignment.fixture.json'), 'utf8')
    );
    
    // Parse the directive
    const ast = parseDirective(fixture.directives[0]);
    
    // Transform it
    const result = transformDirective(ast);
    
    // Verify the result matches the expected output
    expect(result).toEqual(fixture.expected);
  });
});
```