# Hash Cache Grammar Update Implementation Plan

## Overview
Update the mlld grammar to support new import syntax for registry modules and aliases while maintaining backward compatibility with path-based imports.

## Context
- Read `_dev/HASH-CACHE.md` for the full design
- Read `CLAUDE.md` for project conventions
- This is phase 2 of 3 for implementing the hash cache system
- Phase 1 (registry update) must be complete before starting this

## Current State
- Import syntax: `@import { x } from "path/to/file"`
- Paths must be quoted strings
- Grammar files in `grammar/directives/import.peggy` and `grammar/patterns/`

## New Syntax Requirements

### Valid New Syntax
```mlld
# Registry modules - no quotes, no brackets
@import { utils } from @adamavenir/json-utils
@import { legacy } from @adamavenir/json-utils@e3b0c4

# Aliases - referenced as variables with @ prefix
@import { helpers } from @myalias

# Existing paths - still need quotes (or brackets for consistency)
@import { local } from "./lib/utils.mld"
@import { remote } from "https://example.com/tool.mld"
```

### Invalid Syntax (Must Error)
```mlld
# Module refs cannot be in brackets/quotes
@import { bad } from [@adamavenir/json-utils]  # ❌
@import { bad } from "@adamavenir/json-utils"  # ❌
```

## Implementation Tasks

### 1. Create Module Reference Pattern
**New file**: `grammar/patterns/module-reference.peggy`

```peggy
// Module reference for imports only
// Format: @username/module or @username/module@version

ModuleReference "module reference"
  = "@" module:ModulePath version:ModuleVersion? {
      return helpers.createModuleReference(module, version);
    }

ModulePath "module path"
  = username:ModuleIdentifier "/" name:ModuleIdentifier {
      return { username, name };
    }

ModuleIdentifier "module identifier"
  = head:[a-zA-Z] tail:[a-zA-Z0-9-_]* {
      return head + tail.join('');
    }

ModuleVersion "module version"
  = "@" version:ShortHash {
      return version;
    }

ShortHash "short hash"
  = chars:[a-f0-9]+ {
      const hash = chars.join('');
      if (hash.length < 4) {
        error('Module version hash must be at least 4 characters');
      }
      return hash;
    }

// Alias reference - just a variable reference
AliasReference "alias reference"
  = "@" name:BaseIdentifier {
      return helpers.createAliasReference(name);
    }
```

### 2. Update Import Grammar
**File**: `grammar/directives/import.peggy`

Update the import source to accept module references:

```peggy
ImportSource "import source"
  = ModuleOrAliasReference  // New: @user/module or @alias
  / QuotedPath              // Existing: "path/to/file"
  / BracketedPath           // Existing: [path/to/file]

ModuleOrAliasReference
  = ModuleReference       // @user/module[@version]
  / AliasReference        // @myalias

QuotedPath
  = '"' path:PathContent '"' {
      return helpers.createPathNode('file', path);
    }

BracketedPath  
  = "[" _ path:PathExpression _ "]" {
      return path;
    }
```

### 3. Create AST Node Types
**File**: `core/types/nodes.ts`

Add new node types:

```typescript
export interface ModuleReferenceNode {
  type: 'module-reference';
  username: string;
  name: string;
  version?: string;
  location: Location;
}

export interface AliasReferenceNode {
  type: 'alias-reference';
  name: string;
  location: Location;
}

// Update ImportNode to accept new source types
export interface ImportNode {
  type: 'import';
  imports: ImportItem[];
  source: PathNode | ModuleReferenceNode | AliasReferenceNode;
  location: Location;
}
```

### 4. Grammar Helper Functions
**File**: `grammar/parser/grammar-core.ts`

Add helper functions:

```typescript
createModuleReference(
  module: { username: string; name: string },
  version?: string
): ModuleReferenceNode {
  return {
    type: 'module-reference',
    username: module.username,
    name: module.name,
    version,
    location: this.location()
  };
}

createAliasReference(name: string): AliasReferenceNode {
  return {
    type: 'alias-reference', 
    name,
    location: this.location()
  };
}
```

### 5. Validation Rules

Add semantic validation to ensure:
1. Module references only appear in import directives
2. No module references in path contexts (add/text/etc)
3. Alias names don't conflict with module names
4. Version hashes are at least 4 characters

### 6. Update Syntax Highlighting
**Files**: 
- `grammar/generated/mlld.tmLanguage.json`
- `grammar/generated/mlld.vim`
- `grammar/generated/prism-mlld.js`

Add patterns for:
- Module references: `@username/module`
- Version suffixes: `@e3b0c4`
- Alias references: `@myalias`

## Testing Plan

### Grammar Tests
**File**: `grammar/tests/import.test.ts`

Test cases:
1. Parse `@import { x } from @user/module`
2. Parse `@import { x } from @user/module@abc123`
3. Parse `@import { x } from @myalias`
4. Error on `@import { x } from [@user/module]`
5. Error on `@import { x } from "@user/module"`
6. Existing path imports still work

### AST Validation Tests
1. Module refs produce correct AST nodes
2. Location tracking works correctly
3. Invalid contexts throw errors

### Integration Tests
Ensure the parser integrates correctly with:
1. Syntax highlighting
2. Error messages
3. AST factory

## Backward Compatibility

- All existing import syntax continues to work
- Only new unquoted/unbracketed syntax triggers module resolution
- Clear error messages for common mistakes

## Success Criteria

- [ ] Grammar parses new module/alias syntax
- [ ] AST nodes correctly represent module refs
- [ ] Validation prevents module refs outside imports
- [ ] Syntax highlighting updated
- [ ] All tests passing
- [ ] No regression in existing imports

## Next Steps

After this phase:
1. Update interpreter to resolve module references from lock file (HASH-CACHE-INTERPRETER-UPDATE.md)