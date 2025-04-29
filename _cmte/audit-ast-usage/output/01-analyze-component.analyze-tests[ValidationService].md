I'll analyze the ValidationService test file to identify any issues related to the AST structure changes.

## Findings

After reviewing the test file, I've identified the following areas that need to be updated to align with the new AST structure:

1. **Line 267-270**: The test creates a directive node with imports array. This appears to be using the DirectiveNodeFactory correctly, but we should verify the factory implementation is updated to use the new structure.
   ```javascript
   const node = directiveNodeFactory.createDirectiveNode('import', { 
     path: 'imports.meld', 
     imports: [{ name: 'role' }] 
   });
   ```

2. **Line 271-274**: Similar to above, creates a directive node with imports array including alias.
   ```javascript
   const node = directiveNodeFactory.createDirectiveNode('import', { 
     path: 'imports.meld', 
     imports: [{ name: 'role', alias: 'roles' }] 
   });
   ```

3. **Line 277-280**: Creates directive node with empty alias in imports array.
   ```javascript
   const node = directiveNodeFactory.createDirectiveNode('import', { 
     path: 'imports.meld', 
     imports: [{ name: 'role', alias: '' }] 
   });
   ```

4. **Line 285-287**: Creates directive node with imports array.
   ```javascript
   const node = directiveNodeFactory.createDirectiveNode('import', { 
     path: 'imports.meld', 
     imports: [{ name: 'role' }] 
   });
   ```

5. **Line 290-295**: Creates directive node with multiple imports in the imports array.
   ```javascript
   const node = directiveNodeFactory.createDirectiveNode('import', {
     path: 'imports.meld',
     imports: [{ name: 'var1' }, { name: 'var2', alias: 'alias2' }, { name: 'var3' }]
   });
   ```

6. **Line 305**: Creates directive node with imports array but no path.
   ```javascript
   const node = directiveNodeFactory.createDirectiveNode('import', { imports: [{ name: 'var1' }] });
   ```

7. **Line 311**: Creates directive node with empty imports array.
   ```javascript
   const node = directiveNodeFactory.createDirectiveNode('import', { path: 'path.meld', imports: [] });
   ```

8. **Line 339-347**: Directly accesses and modifies the directive.fuzzy property. This should be updated to use the correct property path.
   ```javascript
   const node = createEmbedDirective('test.md', 'section');
   if (node.directive) node.directive.fuzzy = 0.8;
   ```

9. **Line 351-354 and 359-362**: Similar to above, directly modifies directive.fuzzy.
   ```javascript
   const node = createEmbedDirective('test.md', 'section');
   if (node.directive) node.directive.fuzzy = -0.1;
   ```
   And:
   ```javascript
   const node = createEmbedDirective('test.md', 'section');
   if (node.directive) node.directive.fuzzy = 1.1;
   ```

10. **Line 370-379**: Directly creates a DirectiveNode with a directive property. This should be updated to use the new structure.
    ```javascript
    const node: DirectiveNode = {
      type: 'Directive',
      directive: {
        kind: 'unknown' as any,
        identifier: 'test', 
        value: 'test'
      },
      location: createLocation()
    };
    ```

These areas need to be updated to align with the new AST structure according to the context provided. The main issues are related to the direct use of the `directive` property and how imports and other directive-specific properties are handled.