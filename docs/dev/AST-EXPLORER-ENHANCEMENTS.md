# AST Explorer Enhancements Plan

The AST Explorer currently needs improvement in how it generates TypeScript types from AST structures. This document outlines the issues and planned enhancements.

## Current Issues

1. **Individual Instance Files**: The AST Explorer currently creates separate type files for each directive instance (with numeric suffixes like `text-assignment-1.ts`, `text-assignment-2.ts`) rather than properly consolidating them.

2. **Import Path Problems**: The generated consolidated files often contain incorrect import paths, requiring manual fixes.

3. **Missing Discriminated Unions**: The type system doesn't properly implement discriminated unions based on directive kind and subtype.

## Validation Script

We've created a validation script to assess the AST Explorer output against our expected type structure:

```bash
npm run ast:validate
```

This script checks:
- That we have the proper consolidated types (not individual instance files)
- All expected union types and subtypes are present
- No unexpected type files were generated

## Expected Type Structure

The AST Explorer should generate the following type structure:

### Base Node Types
- `BaseNode` - Abstract base for all nodes
- `CommentNode`, `CodeFenceNode`, `TextBlockNode`, `NewlineNode`

### Variable Nodes
- `BaseVariableNode` - Abstract base for variable nodes
- `VariableReferenceNode`, `VariableInterpolationNode`

### Directive Nodes
- `BaseDirectiveNode` - Abstract base for all directives
- `DirectiveNodeUnion` - Union of all directive types

### Text Directives
- `TextDirectiveNode` - Union type for text directives
- `TextAssignmentDirectiveNode`, `TextTemplateDirectiveNode`

### Run Directives
- `RunDirectiveNode` - Union type for run directives
- `RunCommandDirectiveNode`, `RunCodeDirectiveNode`, `RunExecDirectiveNode`

### Import Directives
- `ImportDirectiveNode` - Union type for import directives
- `ImportSelectedDirectiveNode`, `ImportAllDirectiveNode`

### Add Directives
- `AddDirectiveNode` - Union type for add directives
- `AddTemplateDirectiveNode`, `AddVariableDirectiveNode`, `AddPathDirectiveNode`

### Exec Directives
- `ExecDirectiveNode` - Union type for exec directives
- `ExecCommandDirectiveNode`, `ExecCodeDirectiveNode`

### Data Directives
- `DataDirectiveNode` - Data directive for structured data

### Path Directives
- `PathDirectiveNode` - Union type for path directives
- `PathAssignmentDirectiveNode` - Assign a path variable

## Enhancement Plan

1. **Improve Batch Processing**: Update the batch processing module to analyze and group directives by kind and subtype rather than creating individual files.

2. **Implement Discriminated Unions**: Generate proper discriminated union types with the kind and subtype as discriminators.

3. **Consolidate Type Files**: Create one file per directive kind (text.ts, run.ts, etc.) with the appropriate union type, and one file per subtype.

4. **Fix Import Paths**: Ensure generated import paths correctly match the file structure.

5. **Update Type Generation Logic**: Improve the type generation to properly analyze the AST structure and generate accurate TypeScript interfaces.

## Testing

After implementing these enhancements:

1. Run: `npm run ast:process-all`
2. Validate: `npm run ast:validate`
3. Verify the generated types meet our expectations

## Future Improvements

Future versions of the AST Explorer could include:

- Visual exploration of the AST
- Interactive type generation
- Documentation generation
- Integration with the IDE for better developer experience