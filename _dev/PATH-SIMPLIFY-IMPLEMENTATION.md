# PATH SECURITY REMOVAL IMPLEMENTATION

## Overview

This document outlines the implementation plan for removing the restrictive path validation rules from Meld as outlined in [PATH-SIMPLIFY.md](_dev/PATH-SIMPLIFY.md). The goal is to transition from a strict security-focused path validation system to a more permissive one that maintains path variables ($., $~, $PROJECTPATH, $HOMEPATH) as UX features rather than security requirements.

## Implementation Phases

### Phase 1: Grammar Changes ✅

Modify the PEG.js grammar file to remove restrictive path validation:

1. Remove validation that rejects paths with relative segments ('..' or './') ✅
   - Identified in lines 180-182 of meld.pegjs
   - Modified to no longer reject paths with relative segments

2. Remove validation that rejects paths with slashes but no special prefixes ✅
   - Identified in lines 226-229 of meld.pegjs
   - Modified to no longer reject paths with slashes that don't use special variables

3. Remove validation that requires special variables in path directives ✅
   - Identified in lines 1538-1541 of meld.pegjs
   - Modified to no longer require special variables in path directives

4. Update related test cases ✅
   - Modified tests that expected errors for paths that are now valid
   - Updated in core/ast/tests/parser.test.ts

### Phase 2: PathService Implementation (Pending)

Modify the PathService.ts implementation to remove restrictive path validations:

1. Remove validation blocks in the resolvePath() method:
   - Remove block rejecting paths with dot segments (lines 384-392)
   - Remove block rejecting raw absolute paths (lines 394-402)
   - Remove block rejecting paths with slashes but no path variable (lines 405-413)

2. Simplify the validatePath() method to be more permissive
   - Remove restrictive validations while maintaining basic path safety checks

3. Update error handling:
   - Update the PathValidationError class and related error codes
   - Keep basic validation errors for truly problematic paths (e.g., null bytes)
   - Update error messages to provide guidance rather than errors

### Phase 3: Interface Documentation and Tests (Pending)

1. Update IPathService.ts interface documentation:
   - Modify documentation to reflect the new, more permissive rules
   - Clarify that path variables are now UX features rather than security requirements

2. Update tests in PathService.test.ts and PathService.tmp.test.ts:
   - Update tests to verify that previously invalid paths are now valid
   - Ensure path variable functionality still works correctly

### Phase 4: User Documentation (Pending)

1. Update user-facing documentation:
   - Explain the new approach to path handling
   - Document that path variables are UX features rather than security requirements
   - Update examples to show the types of paths that are now valid

## Completed Changes

### Grammar Changes (Phase 1)

1. In `meld.pegjs`:

   - Removed error for paths with relative segments:
   ```diff
   - if (!isRelativePathTest && (path.includes('../') || path.startsWith('./'))) {
   -   error('Path cannot contain relative segments (\'..\' or \'./\')');
   - }
   + // No longer reject paths with relative segments ('..' or './')
   ```

   - Removed error for paths with slashes but no special prefixes:
   ```diff
   - if (path.includes('/') && !isUrl && !isSpecialVarPath && !isTestAllowingSlashedPaths) {
   -   error('Paths with slashes must start with $HOMEPATH/, $~/, $PROJECTPATH/, $./, or a $path/ variable.');
   - }
   + // No longer reject paths with slashes that don't start with special variables
   ```

   - Removed validation requiring special variables in path directives:
   ```diff
   - // Validate special variable requirement
   - if (!hasSpecialVar && !callerInfo.includes('should reject a path directive without special path variable')) {
   -   error('Path directive must use a special path variable ($HOMEPATH, $~, $PROJECTPATH, or $.)');
   - }
   + // No longer require special variables in path directives
   ```

2. In `parser.test.ts`:

   - Updated tests to verify that paths without special variables and paths with relative segments are now accepted:
   ```diff
   - it('should reject a path directive without special path variable', async () => {
   -   const input = '@path config = "path/to/file"';
   -   await expect(parse(input)).rejects.toThrow();
   - });
   + it('should accept a path directive without special path variable', async () => {
   +   const input = '@path config = "path/to/file"';
   +   const { ast } = await parse(input);
   +   
   +   expect(ast).toHaveLength(1);
   +   const node = ast[0] as DirectiveNode;
   +   expect(node.type).toBe('Directive');
   +   expect(node.directive.kind).toBe('path');
   +   expect(node.directive.identifier).toBe('config');
   +   expect(node.directive.path.raw).toBe('path/to/file');
   + });

   - it('should reject a path directive with relative path', async () => {
   -   const input = '@path config = "$HOMEPATH/../file"';
   -   await expect(parse(input)).rejects.toThrow();
   - });
   + it('should accept a path directive with relative path', async () => {
   +   const input = '@path config = "$HOMEPATH/../file"';
   +   const { ast } = await parse(input);
   +   
   +   expect(ast).toHaveLength(1);
   +   const node = ast[0] as DirectiveNode;
   +   expect(node.type).toBe('Directive');
   +   expect(node.directive.kind).toBe('path');
   +   expect(node.directive.identifier).toBe('config');
   +   expect(node.directive.path.raw).toBe('$HOMEPATH/../file');
   + });
   ```

3. Rebuild Parser:
   - Generated new parser files with the grammar changes
   - Verified all tests pass with the new parser

## Next Steps

1. Implement Phase 2: Update the PathService implementation to remove restrictive path validations
2. Implement Phase 3: Update interface documentation and tests
3. Implement Phase 4: Update user-facing documentation

## Testing Strategy

1. Unit tests have been updated to verify grammar changes
2. Additional tests will be needed for PathService implementation changes
3. Integration tests should be run to ensure the entire pipeline works with the new, more permissive path rules
4. End-to-end tests should be updated to verify that previously invalid paths are now valid