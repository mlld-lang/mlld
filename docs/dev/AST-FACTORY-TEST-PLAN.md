** NEEDS REVIEW / UPDATE FOLLOWING AST REFACTOR **

# AST Factory Pattern - Test Plan

This document outlines the testing strategy for the new AST factory pattern implementation.

## Testing Goals

1. Verify that the new factory implementations produce identical nodes to the current system
2. Ensure backward compatibility during the transition
3. Validate circular dependency resolution
4. Test factory DI registration and resolution
5. Verify type safety and validation in factory methods

## Test Structure

### 1. Unit Tests for Factories

Create dedicated unit tests for each factory:

```typescript
// core/syntax/types/factories/NodeFactory.test.ts
import { container } from 'tsyringe';
import { NodeFactory } from '@core/syntax/types/factories/NodeFactory.js';
import { NodeType, SourceLocation } from '@core/syntax/types/interfaces/common.js';

describe('NodeFactory', () => {
  let factory: NodeFactory;
  
  beforeEach(() => {
    factory = container.resolve(NodeFactory);
  });
  
  it('should create a basic node with default location', () => {
    const node = factory.createNode('Text');
    
    expect(node).toEqual({
      type: 'Text',
      location: {
        start: { line: 0, column: 0 },
        end: { line: 0, column: 0 }
      }
    });
  });
  
  it('should create a node with provided location', () => {
    const location: SourceLocation = {
      start: { line: 1, column: 1 },
      end: { line: 2, column: 2 }
    };
    
    const node = factory.createNode('Directive', location);
    
    expect(node).toEqual({
      type: 'Directive',
      location
    });
  });
});
```

Similar unit tests for other factories:
- VariableNodeFactory.test.ts
- DirectiveNodeFactory.test.ts
- TextNodeFactory.test.ts

### 2. Integration Tests for Backward Compatibility

Create tests that compare outputs from old and new implementations:

```typescript
// tests/integration/ast-factory-compatibility.test.ts
import { container } from 'tsyringe';
import { VariableNodeFactory } from '@core/syntax/types/factories/VariableNodeFactory.js';
import { createVariableReferenceNode as oldCreateVariableReferenceNode } from '@core/syntax/types/variables.js';
import { createVariableReferenceNode as newCreateVariableReferenceNode } from '@core/syntax/types/legacy/variables.js';

describe('AST Factory Backward Compatibility', () => {
  it('should create identical variable reference nodes with old and new implementations', () => {
    const oldNode = oldCreateVariableReferenceNode('myVar', 'text');
    const newNode = newCreateVariableReferenceNode('myVar', 'text');
    
    expect(newNode).toEqual(oldNode);
  });
  
  it('should correctly handle all properties and options', () => {
    const fields = [{ type: 'field' as const, value: 'property' }];
    const location = {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 10 }
    };
    
    const oldNode = oldCreateVariableReferenceNode('myVar', 'data', fields, 'json', location);
    const newNode = newCreateVariableReferenceNode('myVar', 'data', fields, 'json', location);
    
    expect(newNode).toEqual(oldNode);
  });
});
```

### 3. DI Container Tests

Test that the DI container correctly resolves factory instances:

```typescript
// tests/integration/ast-factory-di.test.ts
import { container } from 'tsyringe';
import { NodeFactory } from '@core/syntax/types/factories/NodeFactory.js';
import { VariableNodeFactory } from '@core/syntax/types/factories/VariableNodeFactory.js';
import { DirectiveNodeFactory } from '@core/syntax/types/factories/DirectiveNodeFactory.js';
import { TextNodeFactory } from '@core/syntax/types/factories/TextNodeFactory.js';

describe('AST Factory DI Registration', () => {
  it('should resolve NodeFactory from container', () => {
    const factory = container.resolve(NodeFactory);
    expect(factory).toBeInstanceOf(NodeFactory);
  });
  
  it('should resolve VariableNodeFactory from container', () => {
    const factory = container.resolve(VariableNodeFactory);
    expect(factory).toBeInstanceOf(VariableNodeFactory);
  });
  
  it('should resolve DirectiveNodeFactory from container', () => {
    const factory = container.resolve(DirectiveNodeFactory);
    expect(factory).toBeInstanceOf(DirectiveNodeFactory);
  });
  
  it('should resolve TextNodeFactory from container', () => {
    const factory = container.resolve(TextNodeFactory);
    expect(factory).toBeInstanceOf(TextNodeFactory);
  });
  
  it('should inject NodeFactory into other factories', () => {
    const factory = container.resolve(VariableNodeFactory);
    
    // Create a variable node which should use the NodeFactory internally
    const node = factory.createVariableReferenceNode('var', 'text');
    
    expect(node.type).toBe('VariableReference');
    expect(node.location).toBeDefined();
  });
});
```

### 4. Validation Tests

Test validation logic in the factory methods:

```typescript
// core/syntax/types/factories/VariableNodeFactory.test.ts
import { container } from 'tsyringe';
import { VariableNodeFactory } from '@core/syntax/types/factories/VariableNodeFactory.js';

describe('VariableNodeFactory Validation', () => {
  let factory: VariableNodeFactory;
  
  beforeEach(() => {
    factory = container.resolve(VariableNodeFactory);
  });
  
  it('should validate field arrays', () => {
    const validFields = [
      { type: 'field' as const, value: 'property' },
      { type: 'index' as const, value: 0 }
    ];
    
    expect(factory.isValidFieldArray(validFields)).toBe(true);
  });
  
  it('should reject invalid field arrays', () => {
    const invalidFields = [
      { type: 'invalid', value: 'property' },
      { value: 'missing-type' }
    ];
    
    expect(factory.isValidFieldArray(invalidFields as any)).toBe(false);
  });
  
  it('should throw an error when creating a node with invalid fields', () => {
    const invalidFields = [{ type: 'invalid', value: 'property' }];
    
    expect(() => {
      factory.createVariableReferenceNode('var', 'text', invalidFields as any);
    }).toThrow('Invalid fields array provided');
  });
});
```

### 5. End-to-End Tests

Test the complete flow from parsing to node creation:

```typescript
// tests/integration/ast-factory-e2e.test.ts
import { container } from 'tsyringe';
import { ParserService } from '@services/pipeline/ParserService/ParserService.js';
import { InterpreterService } from '@services/pipeline/InterpreterService/InterpreterService.js';
import { NodeFactory } from '@core/syntax/types/factories/NodeFactory.js';
import { VariableNodeFactory } from '@core/syntax/types/factories/VariableNodeFactory.js';

describe('AST Factory Pattern E2E Tests', () => {
  let parserService: ParserService;
  let interpreterService: InterpreterService;
  
  beforeEach(() => {
    parserService = container.resolve(ParserService);
    interpreterService = container.resolve(InterpreterService);
  });
  
  it('should correctly parse and process a document with variable references', async () => {
    const content = '@text greeting = "Hello"\n{{ greeting }} world!';
    
    const nodes = await parserService.parse(content);
    await interpreterService.interpret(nodes);
    
    // Test specific aspects of the processing...
  });
});
```

### 6. Circular Dependency Tests

Create tests specifically targeting previous circular dependency issues:

```typescript
// tests/integration/circular-dependency-resolution.test.ts
import { IVariableReference } from '@core/syntax/types/interfaces/IVariableReference.js';
import { INode } from '@core/syntax/types/interfaces/INode.js';
import { container } from 'tsyringe';
import { VariableNodeFactory } from '@core/syntax/types/factories/VariableNodeFactory.js';

describe('Circular Dependency Resolution Tests', () => {
  it('should allow importing IVariableReference without circular references', () => {
    // This test is valuable because it verifies the import structure
    // Just by successfully importing and using these types, we validate
    // that circular dependencies are fixed
    
    const factory = container.resolve(VariableNodeFactory);
    const node = factory.createVariableReferenceNode('test', 'text');
    
    // Type assertion tests
    const isVar: IVariableReference = node;
    const isNode: INode = node;
    
    expect(isVar.type).toBe('VariableReference');
    expect(isNode.type).toBe('VariableReference');
  });
});
```

## Test Execution

1. Run unit tests for factories in isolation
2. Run integration tests to verify backward compatibility
3. Run DI container tests to ensure proper resolution
4. Run validation tests to ensure proper input handling
5. Run E2E tests to verify overall system integrity
6. Build the project to verify circular dependencies are resolved

## Test Coverage

Ensure test coverage for:

1. All factory methods
2. All property combinations for node creation
3. Error cases and validation
4. DI container resolution
5. Backward compatibility functions

## Success Criteria

1. All tests pass
2. The project builds successfully without circular dependency errors
3. Existing functionality remains unchanged
4. Factory implementations match previous behavior
5. Client code can use both old and new implementations during transition

This test plan will ensure that the factory pattern implementation successfully resolves circular dependencies while maintaining backward compatibility and ensuring correct functionality.