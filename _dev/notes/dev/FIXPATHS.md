# Path Resolution Issues

## Overview

This document tracks the issues discovered with path resolution in the Meld codebase, particularly following the upgrade to `meld-ast` v1.6.1 which changed how paths are represented.

## Core Issues

### 1. StructuredPath Format

The `meld-ast` v1.6.1 update changed how paths are represented:

- **Before**: Paths were simple strings
- **Now**: Paths are objects with the following structure:
  ```typescript
  interface StructuredPath {
    raw: string;
    normalized?: string;
    structured: {
      base: string;
      segments: string[];
      variables?: {
        text?: string[];
        path?: string[];
        special?: string[];
      };
    };
  }
  ```

### 2. Resolution Service Issues

- `resolveInContext` function previously accepted only strings, but now needs to handle both strings and `StructuredPath` objects
- Special path variables like `$PROJECTPATH`, `$HOMEPATH`, `$.`, and `$~` require special handling
- The resolution wasn't correctly handling the structured format of paths

### 3. Path Variable Storage and Retrieval

- Path variables are stored in state (`StateService`) but weren't being correctly:
  - Resolved (especially special variables)
  - Stored in a way that's accessible for TextVar nodes
  - Retrieved for output generation

### 4. Error Message Format Issues

- Error messages for path validation weren't consistent with the expected format in tests:
  - "Raw absolute paths are not allowed" for paths starting with "/"
  - "Path cannot contain . or .. segments" for paths with relative segments

### 5. TextVar Access Issue

- Path variables set using the `@path` directive were not accessible as text variables in output or in text templates
- This is due to variables not being properly mirrored between `path` and `text` variable stores in the state

## Implemented Fixes

### ResolutionService.ts

- Updated `resolveInContext` function to accept both string and StructuredPath types
- Added appropriate type declarations to prevent TypeScript errors
- Enhanced the handling of special path variables

### PathDirectiveHandler.ts

- Updated to correctly handle the StructuredPath object format
- Improved path resolution to handle special path variables (PROJECTPATH, HOMEPATH)
- Added critical functionality to mirror path variables to text variables (`setTextVar`)
- Simplified the resolution process to avoid complex resolution chains

### PathDirectiveValidator.ts

- Updated error messages to match the expected format in tests
- Enhanced validation to properly check for absolute paths and relative segments
- Added appropriate error severity levels

## Remaining Issues

- Integration testing may reveal additional edge cases
- Performance implications of the new structured path format should be evaluated
- More thorough validation may be needed for complex path structures

## Lessons Learned

- Changes to fundamental data structures like path representation require comprehensive updates across the codebase
- Special attention must be paid to how variables are stored and retrieved across different directive types
- Error messages must be consistent to ensure test reliability
- Variable resolution context needs to be carefully maintained 