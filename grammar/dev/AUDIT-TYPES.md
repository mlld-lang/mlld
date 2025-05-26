# Grammar Types Audit

This document contains the results of our grammar types audit, examining the type definitions and their alignment with the actual grammar implementation.

## Current Types Architecture

The Mlld grammar uses TypeScript for type definitions, with types organized across several locations:

1. **Core Types** (`grammar-core.ts`): NodeType and DirectiveKind enums
2. **Grammar Types** (`grammar/types/`): Directive-specific type definitions
3. **Generated Types**: From Peggy during build process

## Audit Process

We'll examine all the type files in the `grammar/types/` directory and compare them with the actual grammar implementation to identify any misalignments, gaps, or potential improvements.

## Findings

TBD - Will be filled after code review

## Recommendations

TBD - Will be filled after code review