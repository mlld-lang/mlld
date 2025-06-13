# Resolver Content Type Implementation - Summary

## Completed Work

### Phase 1: Type System Updates ✅
- Removed `ResourceType` enum from resolver types
- Added `ContentType` type: `'module' | 'data' | 'text'`
- Updated `ResolverCapabilities` with content type support
- Updated all resolvers to return `ResolverContent` with content type

### Phase 2: Import/Path Validation ✅
- Updated `Environment.resolveModule()` to return full content object
- Added content type validation in import evaluator (rejects non-modules)
- Added content type validation in path evaluator (rejects modules)
- Created `importFromResolverContent()` for handling resolver imports

### Phase 3: Environment Variable Handling ✅
- Added `getResolverVariable()` method for async resolver resolution
- Updated `interpolate()` to handle resolver variables properly
- Updated variable reference evaluation for resolver support
- Fixed resolver variable caching and lazy evaluation

### Phase 4: Test Suite ✅
- Created comprehensive unit tests in `/core/resolvers/__tests__/`
  - `content-types.test.ts` - Content type detection tests
  - `context-behavior.test.ts` - Context-dependent behavior tests
  - `import-validation.test.ts` - Import content type validation
  - `path-validation.test.ts` - Path content type validation
- Added integration test cases in `/tests/cases/`
  - `exceptions/import-non-module/` - Test import rejection
  - `exceptions/path-module-content/` - Test path rejection
  - `valid/resolver-contexts/` - Test context behavior

## Key Changes

### Content Type Detection
All resolvers now detect and return appropriate content types:
- `.mld`/`.mlld` files → `module`
- `.json` files or JSON content → `data`  
- Plain text or other content → `text`
- Modules can also be detected by parsing content

### Context-Dependent Behavior
Built-in resolvers adapt based on usage context:
- **TIME**: Returns text in variable context, data object in import context
- **DEBUG**: Returns data in both contexts, different structure for imports
- **INPUT**: Returns appropriate type based on stdin content
- **PROJECTPATH**: Returns text path in variable context, file content in path context

### Module/Path Separation
- Modules can only be imported via `@import`, not used in `@path`
- Using a module in `@path` throws: "Cannot use module as path"
- Using non-module in `@import` throws: "Import target is not a module"

### Resolver Variables
- Resolver variables (e.g., `@TIME`) now properly resolve with context
- Async resolution supports both direct references and interpolation
- Caching prevents redundant resolver calls

## Migration Notes

### For Module Authors
No changes needed - existing modules continue to work as before.

### For mlld Users
- Error messages are clearer when mixing modules and paths
- Built-in resolvers provide richer data in import context
- Performance may improve due to content type caching

### For Resolver Developers
When creating custom resolvers:
1. Implement content type detection in `resolve()`
2. Set appropriate `supportedContentTypes` in capabilities
3. Handle context parameter for context-dependent behavior
4. Return `ResolverContent` with proper `contentType` field

## Next Steps

The remaining low-priority task is designing private module publishing as an extension to publish.ts. This is separate from the resolver system and can be addressed when private module support is needed.

## Testing

Run tests with:
```bash
npm test core/resolvers  # Unit tests
npm test interpreter     # Integration tests
```

All resolver content type features are now fully implemented and tested.