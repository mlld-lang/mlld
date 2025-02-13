# ValidationService

Below is a specific design for the ValidationService that leverages meld-spec's type definitions and constraints. This service ensures each directive's syntax and arguments conform to the spec, while isolating complexity so each directive handler remains small and clear.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I. PURPOSE & SCOPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Provide a single "ValidationService" that validates directives against meld-spec's types and constraints.
2. Keep all directive-specific validations in one place (rather than scattered across handlers).
3. Produce typed errors with location info when validations fail.

In short, before a directive does anything (like storing variables or embedding files), we run "ValidationService" to confirm that the directive matches meld-spec's requirements.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
II. DIRECTORY STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Following the services-based architecture:

services/
 ├─ ValidationService/
 │   ├─ ValidationService.ts       # Main service implementation
 │   ├─ ValidationService.test.ts  # Tests next to implementation
 │   ├─ IValidationService.ts     # Service interface
 │   ├─ validators/               # Individual validators
 │   │   ├─ TextDirectiveValidator.ts
 │   │   ├─ TextDirectiveValidator.test.ts
 │   │   ├─ DataDirectiveValidator.ts
 │   │   ├─ DataDirectiveValidator.test.ts
 │   │   ├─ ImportDirectiveValidator.ts
 │   │   ├─ ImportDirectiveValidator.test.ts
 │   │   ├─ EmbedDirectiveValidator.ts
 │   │   └─ EmbedDirectiveValidator.test.ts
 │   └─ errors/
 │       ├─ ValidationError.ts    # Validation-specific errors
 │       └─ ValidationError.test.ts

Inside IValidationService.ts:

```typescript
import type { DirectiveNode } from 'meld-spec';

export interface IValidationService {
  /**
   * Validate a directive node against its schema and constraints
   * @throws {MeldDirectiveError} If validation fails
   */
  validate(node: DirectiveNode): void;
  
  /**
   * Register a validator function for a specific directive kind
   */
  registerValidator(kind: string, validator: (node: DirectiveNode) => void): void;
  
  /**
   * Remove a validator for a specific directive kind
   */
  removeValidator(kind: string): void;
  
  /**
   * Check if a validator exists for a specific directive kind
   */
  hasValidator(kind: string): boolean;
  
  /**
   * Get all registered directive kinds that can be validated
   */
  getRegisteredDirectiveKinds(): string[];
}
```

Inside ValidationService.ts:

```typescript
import type { DirectiveNode } from 'meld-spec';
import { validationLogger as logger } from '../../core/utils/logger';
import { IValidationService } from './IValidationService';
import { MeldDirectiveError } from '../../core/errors/MeldDirectiveError';

// Import default validators
import { validateTextDirective } from './validators/TextDirectiveValidator';
import { validateDataDirective } from './validators/DataDirectiveValidator';
import { validateImportDirective } from './validators/ImportDirectiveValidator';
import { validateEmbedDirective } from './validators/EmbedDirectiveValidator';

export class ValidationService implements IValidationService {
  private validators = new Map<string, (node: DirectiveNode) => void>();
  
  constructor() {
    // Register default validators
    this.registerValidator('text', validateTextDirective);
    this.registerValidator('data', validateDataDirective);
    this.registerValidator('import', validateImportDirective);
    this.registerValidator('embed', validateEmbedDirective);
    
    logger.debug('ValidationService initialized with default validators', {
      validators: Array.from(this.validators.keys())
    });
  }
  
  validate(node: DirectiveNode): void {
    logger.debug('Validating directive', {
      kind: node.directive.kind,
      location: node.location
    });
    
    const validator = this.validators.get(node.directive.kind);
    if (!validator) {
      throw new MeldDirectiveError(
        `Unknown directive kind: ${node.directive.kind}`,
        node.directive.kind,
        node.location?.start
      );
    }
    
    try {
      validator(node);
      logger.debug('Directive validation successful', {
        kind: node.directive.kind,
        location: node.location
      });
    } catch (error) {
      logger.error('Directive validation failed', {
        kind: node.directive.kind,
        location: node.location,
        error
      });
      throw error;
    }
  }
  
  registerValidator(kind: string, validator: (node: DirectiveNode) => void): void {
    if (!kind || typeof kind !== 'string') {
      throw new Error('Validator kind must be a non-empty string');
    }
    if (typeof validator !== 'function') {
      throw new Error('Validator must be a function');
    }
    
    this.validators.set(kind, validator);
    logger.debug('Registered validator', { kind });
  }
  
  removeValidator(kind: string): void {
    if (this.validators.delete(kind)) {
      logger.debug('Removed validator', { kind });
    }
  }
  
  hasValidator(kind: string): boolean {
    return this.validators.has(kind);
  }
  
  getRegisteredDirectiveKinds(): string[] {
    return Array.from(this.validators.keys());
  }
}
```

Inside TextDirectiveValidator.ts:

```typescript
import type { DirectiveNode, TextDirective } from 'meld-spec';
import { MeldDirectiveError } from '../../../core/errors/MeldDirectiveError';

export function validateTextDirective(node: DirectiveNode): void {
  const directive = node.directive as TextDirective;
  
  // Check required fields from meld-spec
  if (!directive.name || typeof directive.name !== 'string') {
    throw new MeldDirectiveError(
      'Text directive requires a "name" property (string)',
      'text',
      node.location?.start
    );
  }
  
  if (!directive.value || typeof directive.value !== 'string') {
    throw new MeldDirectiveError(
      'Text directive requires a "value" property (string)',
      'text',
      node.location?.start
    );
  }
  
  // Validate variable name format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(directive.name)) {
    throw new MeldDirectiveError(
      'Text directive name must be a valid identifier (letters, numbers, underscore, starting with letter/underscore)',
      'text',
      node.location?.start
    );
  }
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
III. SERVICE ROLE IN THE ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ASCII Overview:

 ┌─────────────────────────┐
 │   DirectiveHandler      │
 │  (e.g., TextDirective)  │
 └───────────┬─────────────┘
             │
     [ directiveNode ]
             │
 ┌───────────v───────────┐
 │   ValidationService    │
 │   (uses meld-spec)    │
 └───────────┬────────────┘
             │
  if valid,   │  if invalid, throw MeldError
             ▼
 ┌─────────────────────────┐
 │  Actual Directive Exec  │
 └─────────────────────────┘

• Each directive handler does:

  validationService.validate(directiveNode);

• If errors are found, a MeldDirectiveError is thrown with location info.  
• If valid, the handler proceeds with normal logic.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IV. INTERNAL DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Within ValidationService.ts:

--------------------------------------------------------------------------------
import { 
  DirectiveNode, 
  TextDirective,
  DataDirective,
  ImportDirective,
  EmbedDirective
} from 'meld-spec';
import { MeldDirectiveError } from '../../core/errors/MeldError';
import { validateTextDirective } from './validators/TextDirectiveValidator';
import { validateDataDirective } from './validators/DataDirectiveValidator';
import { validateImportDirective } from './validators/ImportDirectiveValidator';
import { validateEmbedDirective } from './validators/EmbedDirectiveValidator';

export class ValidationService {
  private validators = new Map<string, (node: DirectiveNode) => void>();

  constructor() {
    this.validators.set('text', validateTextDirective);
    this.validators.set('data', validateDataDirective);
    this.validators.set('import', validateImportDirective);
    this.validators.set('embed', validateEmbedDirective);
    // Add more validators as needed
  }

  public validate(node: DirectiveNode): void {
    const validator = this.validators.get(node.directive.kind);
    if (!validator) {
      throw new MeldDirectiveError(
        `Unknown directive kind: ${node.directive.kind}`,
        node.directive.kind,
        node.location?.start
      );
    }
    validator(node);
  }
}
--------------------------------------------------------------------------------

Direct sub-validators use meld-spec's types:

--------------------------------------------------------------------------------
// validators/TextDirectiveValidator.ts
import { DirectiveNode, TextDirective } from 'meld-spec';
import { MeldDirectiveError } from '../../../core/errors/MeldError';

export function validateTextDirective(node: DirectiveNode): void {
  const directive = node.directive as TextDirective;

  // Check required fields from meld-spec
  if (!directive.name || typeof directive.name !== 'string') {
    throw new MeldDirectiveError(
      'Text directive requires a "name" property (string).',
      'text',
      node.location?.start
    );
  }

  if (typeof directive.value !== 'string') {
    throw new MeldDirectiveError(
      'Text directive "value" must be a string.',
      'text',
      node.location?.start
    );
  }
}

// validators/DataDirectiveValidator.ts
import { DirectiveNode, DataDirective } from 'meld-spec';
import { MeldDirectiveError } from '../../../core/errors/MeldError';

export function validateDataDirective(node: DirectiveNode): void {
  const directive = node.directive as DataDirective;

  // Check required fields from meld-spec
  if (!directive.name || typeof directive.name !== 'string') {
    throw new MeldDirectiveError(
      'Data directive requires a "name" property (string).',
      'data',
      node.location?.start
    );
  }

  // Value must be valid JSON
  try {
    if (typeof directive.value === 'string') {
      JSON.parse(directive.value);
    } else if (typeof directive.value !== 'object') {
      throw new Error('Invalid value type');
    }
  } catch (error) {
    throw new MeldDirectiveError(
      'Data directive "value" must be valid JSON.',
      'data',
      node.location?.start
    );
  }
}
--------------------------------------------------------------------------------

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
V. TESTING STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Unit Tests:

--------------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { ValidationService } from './ValidationService';
import { DirectiveNode, TextDirective } from 'meld-spec';
import { MeldDirectiveError } from '../../core/errors/MeldError';

describe('ValidationService', () => {
  let service: ValidationService;

  beforeEach(() => {
    service = new ValidationService();
  });

  it('validates a valid text directive', () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'text',
        name: 'greeting',
        value: 'Hello'
      } as TextDirective,
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 20 } }
    };
    expect(() => service.validate(node)).not.toThrow();
  });

  it('throws for invalid text directive', () => {
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'text',
        // Missing name
        value: 'Hello'
      } as TextDirective,
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 20 } }
    };
    expect(() => service.validate(node)).toThrow(MeldDirectiveError);
  });
});
--------------------------------------------------------------------------------

Integration Tests:

--------------------------------------------------------------------------------
describe('ValidationService Integration', () => {
  let context: TestContext;
  let service: ValidationService;

  beforeEach(() => {
    context = new TestContext();
    context.initialize();
    service = new ValidationService();
  });

  it('validates directives in a complex document', async () => {
    await context.builder.create({
      files: {
        'test.meld': `
          @text greeting = "Hello"
          @data config = { "key": "value" }
          @import [other.meld]
        `
      }
    });

    // Parse with meld-ast
    const content = context.fs.readFile('test.meld');
    const ast = parserService.parse(content);

    // Validate each directive
    for (const node of ast) {
      if (node.type === 'Directive') {
        expect(() => service.validate(node)).not.toThrow();
      }
    }
  });
});
--------------------------------------------------------------------------------

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VI. ADVANTAGES OF THIS DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Type Safety
   • Uses meld-spec's types
   • Ensures compatibility with grammar
   • Makes refactoring safer

2. Clear Separation
   • Validation logic isolated from handlers
   • Each directive type validated separately
   • Easy to add new validators

3. Error Handling
   • Consistent error types
   • Location information preserved
   • Clear error messages

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VII. FUTURE CONSIDERATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Schema Validation
   • Add JSON Schema validation
   • Validate against meld-spec schemas
   • Custom validation rules

2. Performance
   • Cache validation results
   • Optimize common cases
   • Batch validations

3. Error Reporting
   • Better error messages
   • Validation suggestions
   • Debug logging

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VIII. CONCLUSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This ValidationService design:

1. Properly uses meld-spec's types
2. Maintains type safety throughout
3. Keeps validation logic isolated
4. Provides clear testing patterns
5. Remains extensible for future needs

By leveraging meld-spec's types and following the grammar rules, we create a robust service that fits perfectly into the Meld ecosystem while remaining maintainable and testable.
