# Interpreter Updates for New Features

**Status**: Not Started  
**Priority**: P0 - Required for security and modules  
**Estimated Time**: 2-3 days  
**Dependencies**: Grammar updates, Resolver system

## Objective

Update the interpreter to support all new features: module prefixes as reserved words, @input support, frontmatter integration, resolver system integration, and the new @output directive for multi-output scripts.

## Key Changes

### 1. Reserved Module Prefixes
Prevent variables from using resolver prefixes:
```mlld
# These should error:
@text work = "something"      # Error if @work/ is a resolver prefix
@data personal = {}           # Error if @personal/ is a resolver prefix
```

### 2. @stdin → @input
Global variable change for future extensibility:
```mlld
# Old
@import { name } from "@stdin"

# New  
@import { name } from "@input"
```

### 3. Frontmatter Integration
Make frontmatter data available as @fm:
```mlld
---
title: My Module
---
@add [[Title is {{@fm.title}}]]
```

### 4. Resolver Integration
Route imports through resolver system:
```mlld
@import { helper } from @work/utils     # → GitHub resolver
@import { prompt } from @notes/ai       # → Local resolver
@import { api } from @alice/client      # → DNS resolver
```

### 5. @output Directive (New)
Enable multi-output scripts with routing:
```mlld
# Output to resolvers
@output @summary to @logs/daily-summary.txt
@output @report to @storage/reports/full.json

# Output to file (if allowed)
@output @data to file [./output.xml] as xml

# Output to command (if allowed)
@output @result to @run @uploadCommand
```

## Implementation

### 1. Variable Validation
```typescript
// In Environment.setVariable()
setVariable(name: string, variable: MlldVariable): void {
  // Check if name conflicts with resolver prefix
  const resolverPrefixes = this.getResolverPrefixes();
  for (const prefix of resolverPrefixes) {
    // Remove @ from prefix for comparison
    const prefixName = prefix.slice(1, -1); // "@work/" → "work"
    if (name === prefixName) {
      throw new VariableRedefinitionError(
        `Cannot use '${name}' as variable name - it's a module namespace`,
        variable.location,
        {
          suggestion: `Try a different name. '${name}' is reserved for imports like: @import { x } from ${prefix}module`
        }
      );
    }
  }
  
  // Existing validation...
}

// Get resolver prefixes from lock file
getResolverPrefixes(): string[] {
  const lockFile = this.getLockFile();
  if (!lockFile?.registries) return [];
  return lockFile.registries.map(r => r.prefix);
}
```

### 2. @input Implementation
```typescript
// In import evaluator
if (source === '@input') {
  const inputContent = env.getInputContent(); // Renamed from getStdinContent
  
  // Try to parse as JSON for destructuring
  try {
    const data = JSON.parse(inputContent);
    // Handle destructuring...
  } catch {
    // Treat as plain text
    return { content: inputContent };
  }
}

// In Environment
private inputContent?: string; // Renamed from stdinContent

setInputContent(content: string): void {
  if (!this.parent) {
    this.inputContent = content;
  } else {
    this.parent.setInputContent(content);
  }
}

getInputContent(): string {
  if (!this.parent) {
    return this.inputContent || '';
  }
  return this.parent.getInputContent();
}
```

### 3. Frontmatter Variables
```typescript
// When parsing a file
const { frontmatter, ast } = parseMlld(content);

if (frontmatter) {
  env.setVariable('fm', {
    type: 'data',
    value: frontmatter,
    metadata: {
      isSystem: true,
      immutable: true,
      description: 'Frontmatter data from current file'
    }
  });
}
```

### 4. Module Resolution
```typescript
// In import evaluator
async function evaluateImport(node: ImportDirective, env: Environment) {
  const source = node.source;
  
  if (source.type === 'ModuleReference') {
    // Build full module reference
    const moduleRef = buildModuleRef(source); // @namespace/path/to/module
    
    // Resolve through resolver system
    const resolverManager = env.getResolverManager();
    const content = await resolverManager.resolve(moduleRef);
    
    // Process the imported content
    return processImport(content, node.targets, env);
  }
  
  // Existing path/URL logic...
}

function buildModuleRef(ref: ModuleReference): string {
  let result = `@${ref.namespace}`;
  if (ref.path) {
    result += '/' + ref.path.join('/');
  }
  result += `/${ref.name}`;
  if (ref.hash) {
    result += `@${ref.hash}`;  // Content hash, not version
  }
  return result;
}
```

### 5. Output Directive Implementation
```typescript
// New output evaluator
async function evaluateOutput(node: OutputDirective, env: Environment) {
  // Get the source variable
  const sourceVar = env.getVariable(node.source.name);
  if (!sourceVar) {
    throw new VariableResolutionError(`Variable '${node.source.name}' not found`);
  }
  
  // Format the content if needed
  let content = sourceVar.value;
  if (node.format) {
    content = formatOutput(content, node.format);
  }
  
  // Route to appropriate output
  const target = node.target;
  
  if (target.type === 'ResolverPath') {
    // Output through resolver
    const resolverManager = env.getResolverManager();
    await resolverManager.write(target.path, content);
    
  } else if (target.type === 'FileOutput') {
    // Direct file output (check security policy)
    if (env.securityManager.isPathOnlyMode()) {
      throw new MlldSecurityError(
        'Path-only mode: Direct file output blocked. Use output resolvers.'
      );
    }
    const path = await evaluatePathExpression(target.path, env);
    await env.fileSystem.writeFile(path, content);
    
  } else if (target.type === 'CommandOutput') {
    // Pipe to command
    const command = await evaluateCommand(target.command, env);
    await env.executeCommand(command, { stdin: content });
  }
}

function formatOutput(data: any, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'xml':
      return toXML(data);
    case 'yaml':
      return toYAML(data);
    case 'text':
      return String(data);
    default:
      return data;
  }
}
```

## Error Messages

### Reserved Prefix Error
```
Error: Cannot use 'work' as variable name

The name 'work' is reserved as a module namespace.
You have '@work/' configured as a module prefix.

💡 Try a different variable name, or use this for imports:
   @import { something } from @work/module
```

### Output Resolver Not Found
```
Error: No output resolver for: @undefined/file.json

Available output resolvers:
  @logs/     → Local (./outputs/logs)
  @storage/  → S3 (my-bucket)

💡 Check your resolver configuration or use a different prefix
```

### Path-Only Mode Output Error
```
Error: Direct file output blocked in path-only mode

You tried to output to: ./results.json
In path-only mode, use output resolvers instead:

💡 @output @data to @storage/results.json
```

### Module Not Found
```
Error: No resolver found for: @unknown/module

Available prefixes:
  @work/     → GitHub (company/private-modules)
  @notes/    → Local (~/Documents/Notes)
  @alice/    → Public registry

💡 Check your spelling or configure a resolver for '@unknown/'
```

### Frontmatter Access Error
```
Error: Cannot access @fm.missing.field

The frontmatter does not contain 'missing.field'.
Available fields: title, author, description

💡 Check the frontmatter at the top of the file
```

## Implementation Steps

### Phase 1: Core Updates (Day 1 Morning)
1. [ ] Update Environment for resolver prefixes
2. [ ] Add variable name validation
3. [ ] Rename stdin to input throughout
4. [ ] Update import source handling
5. [ ] Add resolver manager integration
6. [ ] Create output directive evaluator

### Phase 2: Frontmatter Integration (Day 1 Afternoon)
1. [ ] Add frontmatter to parse results
2. [ ] Create @fm variable in environment
3. [ ] Handle frontmatter in imports
4. [ ] Test access patterns
5. [ ] Add type safety

### Phase 3: Error Handling (Day 1 Evening)
1. [ ] Create specific error types
2. [ ] Add helpful error messages
3. [ ] Include suggestions in errors
4. [ ] Test error scenarios
5. [ ] Update error formatter

### Phase 4: Testing (Day 2 Morning)
1. [ ] Test reserved prefix validation
2. [ ] Test @input functionality
3. [ ] Test frontmatter access
4. [ ] Test resolver integration
5. [ ] Test @output directive
6. [ ] Test path-only mode restrictions
7. [ ] Test error messages

### Phase 5: Performance & Polish (Day 2-3)
1. [ ] Profile resolver performance
2. [ ] Add caching where needed
3. [ ] Optimize prefix checking
4. [ ] Test multi-output performance
5. [ ] Document new behaviors
6. [ ] Update examples with @output
7. [ ] Create output routing guide

## Success Criteria

- [ ] Module prefixes properly reserved
- [ ] @input works like old @stdin
- [ ] Frontmatter accessible as @fm
- [ ] Resolvers properly integrated
- [ ] @output directive routes correctly
- [ ] Path-only mode enforced for outputs
- [ ] Clear, helpful error messages
- [ ] No performance regression

## Testing Scenarios

### Reserved Prefix
```mlld
# Should fail
@text work = "value"     # If @work/ is configured

# Should work
@text workplace = "value"
@text my_work = "value"
```

### Input Import
```mlld
# Piped JSON
echo '{"name": "test"}' | mlld run script.mld

# script.mld
@import { name } from @input
@add [[Hello {{name}}]]
```

### Frontmatter Access
```mlld
---
config:
  debug: true
  level: info
---

@if @fm.config.debug
  @add [[Debug mode enabled]]
@end
```

### Output Routing
```mlld
# Generate multiple outputs from one script
@data summary = { count: 42, status: "complete" }
@text report = [[Full report with {{summary.count}} items]]

# Route to different destinations
@output @summary to @logs/summary.json
@output @report to @storage/reports/full.txt
@output @summary to @run [curl -X POST https://api.example.com/webhook]
```

### Path-Only Mode
```mlld
# With path-only mode enabled:
@path data = @data/input.json     # ✓ Allowed (resolver)
@path fail = [./local.json]       # ✗ Blocked

@output @result to @storage/out   # ✓ Allowed (resolver)
@output @result to file [./out]   # ✗ Blocked
```

## Related Documentation

### Architecture & Vision
- [`_dev/ARCHITECTURE.md`](../../ARCHITECTURE.md) - Interpreter architecture
- [`_dev/SECURITY-PRINCIPLES.md`](../../SECURITY-PRINCIPLES.md) - Security model

### Specifications  
- [`_dev/specs/import-syntax.md`](../../specs/import-syntax.md) - Import behavior
- [`_dev/specs/resolver-config.md`](../../specs/resolver-config.md) - Resolver configuration

### Implementation References
- Grammar changes in [`01-grammar-ttl-trust.md`](./01-grammar-ttl-trust.md)
- Resolver system in [`06-resolver-system.md`](./06-resolver-system.md)
- Frontmatter in [`07-frontmatter-support.md`](./07-frontmatter-support.md)