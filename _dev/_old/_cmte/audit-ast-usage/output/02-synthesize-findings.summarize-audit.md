# AST Structure Changes Audit Report

## Summary of Changes Required

This audit report summarizes the necessary changes to align the codebase with the new AST structure. The key structural changes include:
- Removed the `parsed` property from nodes (use `children` array instead)
- Removed the `content` property (use `children` array or `value` property)
- The `children` array now holds parsed node structures
- The `value` property now represents raw string content

## DefineDirectiveHandler

### Implementation Changes
- **Lines 57-59**: Update checks for `parsed` and `content` to use `children` array instead
- **Line 61**: Replace `directive.parsed` with appropriate properties from `children` array
- **Line 62**: Update destructuring of properties to match new structure
- **Lines 92-96**: Update handling of `value` property for InterpolatableValue
- **Lines 136-163**: Update handling of `parsed` property and its subtypes
- **Lines 146-156**: Update resolution of command content
- **Lines 174-175**: Update references to `parsed` to access parameters from new structure

### Test Changes
- Factory functions used throughout tests need to be updated to create nodes with the new structure
- Test assertions may need updating to check for properties in the correct location

## RunDirectiveHandler

### Implementation Changes
- **Lines 91-98**: Replace `parsed` and `content` property access with `children` array
- **Lines 105-107**: Update `runScript` subtype handling to use `children`
- **Lines 108-122**: Update `runCommand` subtype to use `children` for command name and arguments
- **Lines 123-145**: Update `runFile` and `runPipe` subtypes to use appropriate properties
- **Line 109**: Update variable reference access to use `children` array
- **Lines 112-120**: Update `command` references to use `children` directly
- **Lines 130-145**: Update `file` references to use `children`

### Test Changes
- **Lines 262-270**: Update variable reference node creation to use `children` array
- **Line 294**: Replace direct property access with `children` array
- **Lines 348-349**: Update script content access to use `children` array
- **Lines 379-386**: Update parameter node creation to use proper structure
- **Lines 429-435, 460**: Update variable reference node creation to include `children` array
- **Line 473**: Update assertion to check `children` array
- **Lines 485, 507, 517, 538**: Update `command` usage to use `children` array

## PathDirectiveHandler

### Implementation Changes
- **Lines 77-82**: Replace `parsed` property access with `children` array
- **Lines 88-89**: Update `path` and `content` property access

## TextDirectiveHandler

### Implementation Changes
- **Lines 75-98**: Update access to `parsed` and `content` to use `children` array
- **Lines 103-105**: Update destructuring of properties from directive object
- **Lines 109-130**: Update references to `parsed` and `content` to use `children` array
- **Lines 132-227**: Update handling of properties to reference `children` array
- **Line 46**: Update to account for new AST structure with parsed nodes in `children` array

## ResolutionService

### Implementation Changes
No changes needed. The implementation correctly uses the properties that remain in the updated structure.

### Test Changes
Multiple mock VariableReferenceNode objects need `children` arrays added:
- **Lines 242-248, 404-412, 512-524, 536-549, 557-566, 578-588, 602-615, 624-631**: Add empty `children` array to mock VariableReferenceNode
- **Lines 699-703, 712-716, 726-732, 752-758**: Add `children` array to VariableReferenceNode in mock nodes array
- **Lines 833, 849, 860, 882-889, 906-913**: Add `children` array to mock VariableReferenceNode in resolveContent tests

## EmbedDirectiveHandler

### Implementation Changes
No changes needed. The implementation correctly handles the AST structure.

### Test Changes
- **Lines 91-93**: Update `createDirectiveNode` function to use `children` array
- **Lines 110-128, 133-153, 164-182, 184-201, 203-215, 217-234, 236-248**: Update `createEmbedDirectiveNode` to use new structure
- **Lines 250-265**: Update directive node creation and template nodes in `children` array
- **Lines 270-290, 293-326**: Update `createEmbedDirectiveNode` calls
- **Lines 328-350**: Update template creation to match new structure
- **Lines 352-387**: Update transformation mode tests

## Components with No Changes Needed

The following components don't require changes as they already align with the new AST structure:

- **ValidationService**: Works at a higher level of abstraction without directly accessing changed properties
- **DataDirectiveHandler**: Correctly accesses directive-specific data through the `directive` property
- **StateService**: Operates at a higher level without interacting with specific AST node properties
- **ParserService**: Already aligned with the new AST structure
- **ImportDirectiveHandler**: Already correctly uses the `children` array and doesn't rely on removed properties