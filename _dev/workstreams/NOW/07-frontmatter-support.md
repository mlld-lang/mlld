# Frontmatter Support Implementation

**Status**: Not Started  
**Priority**: P0 - Enables metadata and documentation  
**Estimated Time**: 1-2 days  
**Dependencies**: Grammar updates

## Objective

Add YAML frontmatter support to mlld files, making metadata available as `@fm.*` variables and enabling self-documenting modules. **Key principle**: Frontmatter is always optional, never required.

## Design

### Syntax
```mlld
---
title: Customer Support Prompt
author: Alice Johnson
description: Template for tier 1 support responses
tags: [support, customer-service]
readme: https://github.com/alice/prompts
---

# The frontmatter data is available as @fm
@text greeting = [[Hello from {{@fm.author}}!]]
@add [[This is the {{@fm.title}}]]
```

### Features
- Optional YAML frontmatter at file start
- Full YAML support (arrays, objects, etc.)
- Available as `@fm.*` variables (like `@input`)
- Works in all .mld files (not just imports)
- Compatible with Obsidian, Jekyll, etc.
- Each file's frontmatter is isolated
- No reserved fields (conventions only)

## Implementation

### 1. Parser Integration
```typescript
// In grammar parser
interface ParseResult {
  frontmatter?: any;  // Parsed YAML object
  ast: MlldNode[];
}

// Parse frontmatter separately from mlld content
function parseMlld(content: string): ParseResult {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  let frontmatter = null;
  let mlldContent = content;
  
  if (frontmatterMatch) {
    frontmatter = yaml.parse(frontmatterMatch[1]);
    mlldContent = content.slice(frontmatterMatch[0].length);
  }
  
  const ast = parseContent(mlldContent);
  return { frontmatter, ast };
}
```

### 2. Environment Integration
```typescript
// In Environment class
class Environment {
  private frontmatter: any = null;
  
  setFrontmatter(data: any): void {
    this.frontmatter = data;
    // Create @fm variable
    this.setVariable('fm', {
      type: 'data',
      value: data,
      metadata: { 
        isSystem: true,
        description: 'Frontmatter data'
      }
    });
  }
  
  getFrontmatter(): any {
    return this.frontmatter || this.parent?.getFrontmatter();
  }
}
```

### 3. Import Behavior
```mlld
# main.mld has frontmatter with title: "Main"
@import { fm as importedFm } from [./other.mld]

@add [[Local: {{@fm.title}}, Imported: {{@importedFm.title}}]]
```

Frontmatter is isolated per file - imports can access their source file's frontmatter.

## Convention Fields (Not Required!)

Frontmatter has **no reserved fields** - these are just helpful conventions:

```yaml
---
# Module identification
author: Alice Johnson
module: alice/prompts          # For registry modules
description: Customer support templates

# Links
readme: https://github.com/alice/prompts/README.md
issues: https://github.com/alice/prompts/issues
repo: https://github.com/alice/prompts

# Documentation
notes: |
  This module provides templates for customer support.
  Use @import { greeting } for the basic template.

# Custom fields
category: support
license: MIT
---
```

## Implementation Steps

### Phase 1: Parser Support (Day 1 Morning)
1. [ ] Add YAML parser dependency
2. [ ] Create frontmatter extraction
3. [ ] Update parse result structure
4. [ ] Handle missing frontmatter gracefully
5. [ ] Test YAML parsing edge cases

### Phase 2: Interpreter Integration (Day 1 Afternoon)
1. [ ] Add frontmatter to Environment
2. [ ] Create @fm variable
3. [ ] Handle imports with frontmatter
4. [ ] Test variable access patterns
5. [ ] Add error handling

### Phase 3: Import Integration (Day 1 Evening)
1. [ ] Pass frontmatter through imports
2. [ ] Enable destructuring of fm
3. [ ] Test nested imports
4. [ ] Document isolation rules
5. [ ] Handle circular references

### Phase 4: Testing (Day 2 Morning)
1. [ ] Create frontmatter test cases
2. [ ] Test all YAML features
3. [ ] Test @fm access patterns
4. [ ] Test import scenarios
5. [ ] Error case testing

### Phase 5: Documentation (Day 2 Afternoon)
1. [ ] Update syntax documentation
2. [ ] Add frontmatter examples
3. [ ] Document conventions
4. [ ] Migration guide for Obsidian users
5. [ ] Update module templates

## Test Cases

### Basic Frontmatter
```mlld
---
title: Test Module
version: 1.0.0
tags: [test, example]
---

@text title = @fm.title
@add [[Title: {{title}}]]
```

### Nested Data Access
```mlld
---
config:
  api:
    endpoint: https://api.example.com
    timeout: 30
---

@text url = @fm.config.api.endpoint
@data timeout = @fm.config.api.timeout
```

### Import with Frontmatter
```mlld
# other.mld
---
author: Bob
---
@text greeting = "Hello"

# main.mld
@import { greeting, fm as otherFm } from [./other.mld]
@add [[{{greeting}} from {{@otherFm.author}}]]
```

## Success Criteria

- [ ] YAML frontmatter parses correctly
- [ ] @fm variable accessible
- [ ] Imports preserve frontmatter
- [ ] No performance regression
- [ ] Works with Obsidian files
- [ ] Clear error messages

## Security Considerations

- Frontmatter is trusted (same as file content)
- No code execution in YAML
- Size limits on frontmatter (1MB)
- No external references resolved
- Frontmatter cannot override system variables
- Available to all imported code (not private)

## Future Extensions

- Frontmatter schema validation (opt-in)
- Type hints from frontmatter
- Auto-generate from registry
- IDE frontmatter completion
- Integration with resolver metadata

## Related Documentation

### Architecture & Vision
- [`_dev/ARCHITECTURE.md`](../../ARCHITECTURE.md) - Parser and interpreter design
- [`_dev/REGISTRY-VISION.md`](../../REGISTRY-VISION.md) - Module metadata needs

### Specifications
- [`_dev/specs/frontmatter-format.md`](../../specs/frontmatter-format.md) - Frontmatter specification (to be created)
- [`_dev/specs/import-syntax.md`](../../specs/import-syntax.md) - Import behavior

### Implementation References
- Grammar updates in [`01-grammar-ttl-trust.md`](./01-grammar-ttl-trust.md)
- Used by [`06-resolver-system.md`](./06-resolver-system.md) for module metadata