# Emergency Circular Dependency Fix for Module Resolution

## Current Status

After attempting several approaches to fix the circular dependencies in the core type system, we are still encountering build issues. The fundamental problem involves circular dependencies between:

1. `core/syntax/types/index.ts`
2. `core/syntax/types/variables.ts`
3. `core/syntax/types/nodes.ts`
4. `core/syntax/types/shared-types.ts`

Additionally, there are interface files throughout the codebase that are not properly exporting their interfaces, causing "No matching export" errors during build.

## Recommended Emergency Fix

To quickly resolve the immediate build issues and unblock progress, we recommend:

1. **Simplified Circular Import Resolution**:
   - Create a single combined types file that includes all necessary types
   - Replace individual import statements with references to this file
   - Avoid re-exporting patterns that create circular dependencies

2. **Interface Export Fix**:
   - Add proper export statements to all service interfaces
   - Create barrel files (index.ts) in directories that lack them

## Implementation Plan

### 1. Core Type System Fix

1. Create a new file `core/syntax/types/all-types.ts` to consolidate all types
2. Replace imports from individual type files with imports from this single source
3. Update `core/syntax/types.js` to re-export from this file

### 2. Interface Export Fix

Systematically go through each interface file mentioned in the error log and:
1. Ensure the interface is properly exported with `export interface Name`
2. Create barrel files (index.ts) as needed to re-export interfaces
3. Fix import paths to use the correct file/barrel file

### 3. Temporary Workarounds

For stubborn circular dependencies:
1. Use interface merging with declaration instead of imports where needed
2. Consider using type casting for difficult edge cases

## Long-term Solution

While this emergency fix resolves the immediate build issues, a proper solution still requires:

1. Refactoring the type system using interface segregation
2. Creating dedicated shared type files that break circular dependencies
3. Implementing consistent export patterns throughout the codebase

The plan outlined in MODULE-RESOLUTION-ADDENDUM.md remains the proper long-term solution, but this emergency fix allows progress in the interim.