# ImportDirectiveHandler Migration Status

## Completed Work

### Handler Updates (✅ Complete)
1. Updated imports to use `@core/ast/types` instead of `@core/syntax/types`
2. Replaced `node.directive` access with direct property access:
   - Using `node.kind` instead of `node.directive.kind`
   - Using `node.values.path` instead of `node.directive.path`
   - Using `node.values.imports` instead of `node.directive.imports`
3. Updated path resolution to use `resolveNodes` instead of `resolveInContext`
4. Added proper type guards for discriminated union
5. Added logic to extract raw path string from path nodes
6. Added logic to process imports based on node subtype

### Fixture Test Updates (✅ Complete)
1. Updated imports to use new AST types
2. Removed adapter layer from `getDirectiveFromFixture` helper
3. Added `resolveNodes` method to mock services
4. Updated all test expectations to use new AST structure

### Regular Test Updates (🔄 In Progress)
1. Updated imports to use new AST types
2. Added `resolveNodes` method to mock services  
3. Updated node creation patterns for specific tests:
   - ✅ `$. alias for project path` test
   - ✅ `$PROJECTPATH for project path` test
   - ❌ Remaining tests need similar updates

## Next Steps

### Complete Regular Test Migration
1. Update all remaining `createDirectiveNode` calls to use new AST structure
2. Replace all `mockResolutionService.resolveInContext` with `resolveNodes`
3. Update all test expectations from `node.directive.path` to `node.values.path`
4. Update all test expectations from `node.directive.imports` to `node.values.imports`

### Test Pattern Template
```typescript
// Old pattern
const node = createDirectiveNode('import', { 
  path: { raw: 'file.mld', structured: {...} }, 
  imports: [{ name: '*' }], 
  subtype: 'importAll' 
}) as DirectiveNode<ImportDirectiveData>;

// New pattern
const node = createDirectiveNode('import', {
  kind: 'import',
  subtype: 'importAll',
  values: {
    imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }],
    path: [
      { type: 'Text', content: 'file.mld' }
    ]
  },
  raw: {
    imports: '*',
    path: 'file.mld'
  }
}) as ImportDirectiveNode;
```

### Common Path Patterns
1. Simple file: `[{ type: 'Text', content: 'file.mld' }]`
2. Path with folder: `[{ type: 'Text', content: 'folder' }, { type: 'PathSeparator', separator: '/' }, { type: 'Text', content: 'file.mld' }]`
3. Variable path: `[{ type: 'VariableReference', identifier: 'docs' }, { type: 'PathSeparator', separator: '/' }, { type: 'Text', content: 'file.mld' }]`
4. Project path: `[{ type: 'VariableReference', identifier: '.' }, { type: 'PathSeparator', separator: '/' }, { type: 'Text', content: 'file.mld' }]`
5. Home path: `[{ type: 'VariableReference', identifier: '~' }, { type: 'PathSeparator', separator: '/' }, { type: 'Text', content: 'file.mld' }]`

### Import Patterns
1. Import all: `imports: [{ type: 'VariableReference', identifier: '*', valueType: 'import' }]`
2. Selected imports: `imports: [{ type: 'VariableReference', identifier: 'varName', valueType: 'import', alias?: 'aliasName' }]`

## Files to Update
1. `/Users/adam/dev/meld/services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts` - Continue updating test cases
2. `/Users/adam/dev/meld/services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts` - Update transformation tests if any

## Testing
Once all tests are updated:
1. Run `npm test services/pipeline/DirectiveService/handlers/execution` to verify all tests pass
2. Remove any remaining references to old AST structure
3. Update fixture migration tracker to mark complete