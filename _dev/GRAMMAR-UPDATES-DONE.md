# Grammar Updates Summary - TTL, Trust, and Module System

## Overview
Implemented comprehensive grammar updates to support TTL (Time To Live), Trust levels, module hashes, and new directives as specified in the workstream plan.

## New Grammar Features

### 1. Security Options (TTL and Trust)
Created `grammar/patterns/security-options.peggy` to provide reusable security patterns across all directives.

#### TTL (Time To Live) Syntax
- **Duration format**: `(30s)`, `(5m)`, `(2h)`, `(7d)`, `(1w)`
- **Special values**: `(live)`, `(static)`
- Supports seconds, minutes, hours, days, and weeks
- Helper function `ttlToSeconds()` converts all formats to seconds

#### Trust Levels
- **Syntax**: `trust always`, `trust verify`, `trust never`
- No angle brackets (as explicitly specified)
- Trust precedence: `never` wins, then most specific path

### 2. Module Hash Syntax
- **Format**: `@namespace/module@hash`
- Hash must be 4+ hexadecimal characters
- Example: `@user/settings@abc123`, `@org/utils@fedcba9876543210`
- Implemented in `ModuleReference` rule with `ShortHash` validation

### 3. New/Updated Directives

#### @input (renamed from @stdin)
- New syntax: `@import { config } from @input`
- Backward compatibility maintained for `@stdin`
- Both syntaxes work identically

#### @output Directive (New)
- **Resolver output**: `@output @data to npm:registry/@myorg/config as json`
- **File output**: `@output @content to "./output.md"`
- **Command output**: `@output @results to [jq '.data'] as json`
- Smart format detection based on file extensions
- Explicit format override with `as <format>`

### 4. Frontmatter Support
Created `grammar/base/frontmatter.peggy` for YAML frontmatter parsing.
- Frontmatter must appear at document start
- Access via `@fm.*` or `@frontmatter.*`
- Example: `@fm.title`, `@frontmatter.metadata.version`

### 5. Reserved Variables
- **Added**: `@TIME` (current timestamp)
- **Kept**: `@PROJECTPATH` (project root directory)
- **Removed**: `@HOMEPATH` (as specified)

## Implementation Details

### Updated Files

#### Core Grammar Files
- `grammar/patterns/security-options.peggy` - New security patterns
- `grammar/base/frontmatter.peggy` - New frontmatter support
- `grammar/directives/output.peggy` - New output directive
- `grammar/deps/grammar-core.ts` - Helper functions for new features
- `grammar/patterns/variables.peggy` - Reserved variables and frontmatter access

#### Updated Directives
All directives now support security options where applicable:
- `@import` - Security before imports list: `@import (30m) trust verify { api } from "file.mld"`
- `@add` - Security before content: `@add (5m) trust always @content`
- `@path` - Security before identifier: `@path (1h) trust always cache = "./cache"`
- `@text` - Security before identifier: `@text (static) message = "Hello"`
- `@run` - Security before command: `@run (30s) trust always [echo "test"]`
- `@exec` - Trust only, after identifier: `@exec trust verify cmd() = @run [...]`

### Grammar Architecture Principles Followed
1. **Single Source of Truth**: SecurityOptions defined once, reused everywhere
2. **Abstraction-First Design**: Patterns extracted to `patterns/` directory
3. **DRY Code**: Helper functions in grammar-core.ts handle common logic
4. **Backward Compatibility**: @stdin still works alongside new @input
5. **Consistent Syntax**: Security options follow same pattern across directives

### Type System Updates
- Added to `core/types/primitives.ts`:
  - `SecurityOptions`, `TTLOption`, `TrustLevel` interfaces
  - `FrontmatterNode`, `NewlineNode`, `SectionMarkerNode` types
  - Updated `DirectiveKind` and `DirectiveSubtype` enums
- Created `core/types/output.ts` with complete output directive types
- Updated `MlldNode` union to include new node types

### Test Coverage
Created comprehensive test suites in `tests/cases/valid/`:
- `security/` - TTL durations, special values, trust levels, combined options
- `input/` - New @input syntax and @stdin compatibility
- `output/` - Resolver, file, and command outputs
- `frontmatter/` - Basic access and alias patterns
- `reserved/` - @TIME and @PROJECTPATH variables
- `modules/` - Hash syntax and security option combinations

All tests generate proper fixtures and pass grammar parsing.

## Key Design Decisions

1. **Security Options Placement**: Always before the main content for consistency
2. **Quoted String Support**: Added to all path-accepting directives alongside bracketed paths
3. **Trust-Only for Exec**: @exec only supports trust (not TTL) as it defines commands
4. **Format Detection**: Smart detection from file extensions, explicit override available
5. **Module Hashes**: Content-based versioning, not semver

## Migration Notes
- Existing mlld files continue to work without modification
- @stdin imports will show deprecation notice but function normally
- Security options are entirely optional - omitting them preserves current behavior