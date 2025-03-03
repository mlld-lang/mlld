# Meld Transformation Issues

This directory contains documentation for debugging and resolving transformation issues in the Meld project.

## What Are Transformation Issues?

Transformation issues occur when Meld's transformation mode doesn't correctly process directives, variables, or other elements. In transformation mode, Meld should:

- Replace variable references `{{variable}}` with their values
- Process directives like `@import` and `@embed` to include their content
- Execute commands with `@run` directives
- Format output according to specified formats

When these transformations don't work correctly, tests fail and users experience unexpected output.

## Current Status

- ✅ **Variable Resolution**: Fixed issues with resolving variables in transformed output
- ✅ **Array Access**: Fixed array access in variable references (both dot and bracket notation)
- ✅ **Error Handling**: Improved error handling during transformation 
- 🔄 **Import/Embed Processing**: Partially fixed issues with import and embed directives
- ❌ **Path Validation**: Still issues with path validation in transformation mode
- ❌ **CLI Tests**: Several CLI tests still failing 

## Key Issues and Documentation

### 📚 Core Documentation

- [**CONTEXT.md**](./CONTEXT.md) - Essential context about Meld and transformation
- [**DEBUGGING.md**](./DEBUGGING.md) - Comprehensive guide to debugging transformation issues

### 🐛 Specific Issues

- [**Variable Resolution Issues**](./variable-resolution-issues.md) - Issues with variable reference resolution
- [**Import and Embed Issues**](./import-embed-issues.md) - Issues with import and embed directives
- [**Path Validation Issues**](./path-validation-issues.md) - Issues with path validation in transformation mode

### 📖 Reference Guides

- [**Transformation Options**](./transformation-options-reference.md) - Reference for selective transformation options
- [**Variable Formats**](./variable-formats-reference.md) - Reference for variable reference formats and resolution
- [**StateService Transformation**](./state-service-transformation.md) - Reference for how StateService manages transformed nodes

## Common Issue Patterns

When debugging transformation issues, look for these common patterns:

1. **State Inheritance Problems**: Variables not being properly propagated between states
2. **Transformation Flag Issues**: Transformation not being properly enabled or selective transformation not working
3. **AST Node Handling**: Different node types (Text, TextVar, DataVar) not being handled consistently
4. **Error Propagation**: Errors being swallowed instead of propagated during transformation
5. **Resolution Service Integration**: Issues with how OutputService uses ResolutionService

## Debugging Quick Start

1. **Enable Debug Logging**:
   ```typescript
   // Add to relevant test or code
   console.log('Available variables:', Array.from(state.getAllTextVars().keys()));
   ```

2. **Run Specific Test**:
   ```bash
   npm test -- api/integration.test.ts -t "should handle simple imports"
   ```

3. **Use Debug CLI Commands**:
   ```bash
   meld debug-resolution myfile.meld --var importedVar
   meld debug-transform myfile.meld --directive-type import
   meld debug-context myfile.meld --visualization-type hierarchy
   ```

4. **Check Transformation Enablement**:
   ```typescript
   // Verify transformation is enabled
   console.log('Transformation enabled:', state.isTransformationEnabled());
   console.log('Transformation options:', state.getTransformationOptions());
   ```

5. **Debug State Inheritance**:
   ```typescript
   // In ImportDirectiveHandler after processing import
   console.log('Parent state variables:', 
     Array.from(context.parentState.getAllTextVars().keys()));
   console.log('Target state variables:', 
     Array.from(targetState.getAllTextVars().keys()));
   ```

## Key Files for Transformation Issues

- `services/pipeline/OutputService/OutputService.ts` - Handles conversion of AST nodes to output formats
- `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.ts` - Resolves variable references
- `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.ts` - Handles import directives
- `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.ts` - Handles embed directives
- `services/state/StateService.ts` - Manages transformation state
- `api/index.ts` - Main API entry point where transformation is configured

## Contributing to Documentation

When adding to this documentation:

1. Focus on practical debugging strategies
2. Include code examples where possible
3. Document patterns and anti-patterns
4. Update status information when issues are resolved
5. Move resolved issue documentation to the archive folder