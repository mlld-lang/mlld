# With Clauses Development Guide

> **Status**: Grammar design updated to support unified tail syntax with TTL/trust integration

This guide covers the technical implementation details for the `with` clause feature in mlld, which provides execution modifiers for directives.

## Overview

The `with` clause is part of a unified "tail syntax" system where directives can have modifiers after their main content. All tail keywords except `with` are syntactic sugar that internally create a `with` clause.

### Tail Syntax Design

```mlld
# Single property syntactic sugar
run [cmd] trust always                    # → with { trust: always }
run [cmd] pipeline [@transform]           # → with { pipeline: [@transform] }
run [cmd] | @filter @formatter           # → with { pipeline: [@filter, @formatter] }

# Multiple properties require with object
run [cmd] with { trust: always, pipeline: [@transform] }

# Exec-defined command invocations
@exec process(data) = run [(python process.py @data)]
@run @process(input) trust always          # → with { trust: always }
@run @process(input) | @validate @save     # → with { pipeline: [@validate, @save] }

# TTL for path/import (special syntax)
@path url = https://example.com (5d) trust always
@import [file.mld] (30m) trust verify
```

### Supported Tail Keywords

- `trust` - Security trust level (always/never/verify)
- `pipeline` or `|` - Chain of transformations
- `needs` - Dependency validation
- `with` - Object containing any combination of the above

### Key Features

1. **Pipelines**: Chain transformations on command output via `@input` variable
2. **Dependencies**: Validate required packages before execution
3. **Trust Levels**: Control security for URL fetching and command execution
4. **TTL (Time To Live)**: Cache duration for URL resources (path/import only)

### Target Design: Unified Tail Modifier Support

**All exec invocations** will support tail modifiers uniformly:

```mlld
# Target syntax - tail modifiers work everywhere
@output @generateReport() trust always [report.pdf]     # ✅ Valid
@text data = @fetchData() | @parse                      # ✅ Valid  
@add @greeting("World") | @uppercase                    # ✅ Valid
@when @isReady() => @deploy() trust always              # ✅ Valid

# @run wrapper still works but becomes optional
@output @run @generateReport() trust always [report.pdf] # ✅ Valid (redundant)
```

This creates a consistent experience where exec-defined commands are first-class citizens with full modifier support.

## Grammar Integration

### AST Extensions

The `with` clause requires extending directive AST nodes to support tail modifiers:

```typescript
// In core/types/run.ts
export interface RunCommandDirectiveNode extends RunDirectiveNode {
  subtype: 'runCommand';
  values: {
    command: ContentNodeArray;
    withClause?: WithClauseValues; // Normalized tail modifiers
  };
  raw: {
    command: string;
    withClause?: string; // Raw tail modifier text
  };
  meta: {
    isMultiLine: boolean;
    hasVariables: boolean;
    withClause?: WithClauseMeta; // Parsed tail modifier metadata
  };
}

// For exec invocations (e.g., @run @myCommand())
export interface RunExecReferenceDirectiveNode extends RunDirectiveNode {
  subtype: 'runExecReference';
  values: {
    commandRef: CommandReference;
    withClause?: WithClauseValues; // Same tail modifier support
  };
  // ... similar structure
}

// New types for with clause support
export interface WithClauseValues {
  pipeline?: CommandReference[];
  needs?: DependencyDeclaration[];
}

export interface WithClauseMeta {
  hasPipeline: boolean;
  hasNeeds: boolean;
  pipelineLength?: number;
  dependencyCount?: number;
}

export interface CommandReference {
  type: 'commandRef';
  identifier: string;
  fields?: FieldAccess[];
  args?: any[];
}

export interface DependencyDeclaration {
  language: string;
  packages: { [packageName: string]: string }; // package -> version constraint
}
```

### Grammar Rules

Extend `grammar/directives/run.peggy` to support tail syntax for all @run forms:

```peggy
// In run.peggy - Direct command execution
AtRunCommand
  = DirectiveContext "@run" _ "[" parts:RunCommandParts "]" 
    tail:TailModifiers? comment:InlineComment? {
      // Convert tail modifiers to withClause
      const withClause = tail ? normalizeToWithClause(tail) : null;
      
// In run.peggy - Exec invocation  
AtRunExecReference
  = DirectiveContext "@run" _ ref:CommandReference
    tail:TailModifiers? comment:InlineComment? {
      // Same tail modifier support
      const withClause = tail ? normalizeToWithClause(tail) : null;
      
      // ... create directive with withClause ...
    }

// Unified tail modifiers grammar
TailModifiers
  = _ keyword:TailKeyword _ value:TailValue {
      // Single keyword sugar
      if (keyword === "with") {
        return value; // Already an object
      } else if (keyword === "|") {
        return { pipeline: value };
      } else {
        return { [keyword]: value };
      }
    }

TailKeyword
  = "trust" / "pipeline" / "|" / "needs" / "with"

TailValue  
  = "{" _ props:WithProperties _ "}" { return props; }      // for 'with'
  / "[" _ items:TransformerList _ "]" { return items; }     // for 'pipeline'
  / transformers:PipelineShorthand { return transformers; }   // for '|'
  / level:TrustLevel { return level; }                        // for 'trust'
  / deps:DependencyObject { return deps; }                    // for 'needs'

TrustLevel = "always" / "never" / "verify"

PipelineShorthand  
  = first:CommandReference rest:(_ ref:CommandReference { return ref; })* {
      return [first, ...rest];
    }

// Original with clause for object syntax
WithClause  
  = "with" _ "{" _ clauses:WithClauseBody _ "}" {
      return clauses;
    }

WithClauseBody
  = pipeline:PipelineClause comma:(_ "," _)? needs:NeedsClause? {
      return {
        ...(pipeline ? { pipeline: pipeline } : {}),
        ...(needs ? { needs: needs } : {})
      };
    }
  / needs:NeedsClause comma:(_ "," _)? pipeline:PipelineClause? {
      return {
        ...(needs ? { needs: needs } : {}),
        ...(pipeline ? { pipeline: pipeline } : {})
      };
    }

PipelineClause
  = "pipeline:" _ "[" _ transformers:TransformerList? _ "]" {
      return transformers || [];
    }

TransformerList
  = first:CommandReference rest:(_ "," _ t:CommandReference { return t; })* {
      return [first, ...rest];
    }

NeedsClause
  = "needs:" _ "{" _ deps:DependencyList? _ "}" {
      return deps || {};
    }

DependencyList
  = first:LanguageDependency rest:(_ "," _ d:LanguageDependency { return d; })* {
      const result = {};
      [first, ...rest].forEach(lang => {
        result[lang.language] = lang.packages;
      });
      return result;
    }

LanguageDependency
  = lang:StringLiteral _ ":" _ "{" _ packages:PackageList? _ "}" {
      return {
        language: lang,
        packages: packages || {}
      };
    }

PackageList
  = first:PackageDependency rest:(_ "," _ p:PackageDependency { return p; })* {
      const result = {};
      [first, ...rest].forEach(pkg => {
        result[pkg.name] = pkg.version;
      });
      return result;
    }

PackageDependency
  = name:StringLiteral _ ":" _ version:StringLiteral {
      return { name, version };
    }
```

## Interpreter Integration

### Pipeline Execution

Extend `interpreter/eval/run.ts`:

```typescript
export async function evaluateRun(
  directive: RunDirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Check for with clause
  if (directive.values.withClause) {
    return await evaluateRunWithClause(directive, env);
  }
  
  // ... existing run evaluation logic
}

async function evaluateRunWithClause(
  directive: RunDirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const withClause = directive.values.withClause!;
  
  // 1. Check dependencies first
  if (withClause.needs) {
    await validateDependencies(withClause.needs, env);
  }
  
  // 2. Execute base command
  let result: string;
  if (isRunCommandDirective(directive)) {
    const command = await interpolate(directive.values.command, env);
    result = await env.executeCommand(command);
  } else {
    throw new Error('With clauses only supported on command directives');
  }
  
  // 3. Execute pipeline if present
  if (withClause.pipeline && withClause.pipeline.length > 0) {
    result = await executePipeline(result, withClause.pipeline, env);
  }
  
  return { value: result, env };
}

async function executePipeline(
  input: string,
  transformers: CommandReference[],
  env: Environment
): Promise<string> {
  let currentInput = input;
  
  for (let i = 0; i < transformers.length; i++) {
    const transformer = transformers[i];
    
    try {
      // Create child environment with @input variable
      const childEnv = env.createChild();
      childEnv.setVariable('input', {
        type: 'text',
        name: 'input',
        value: currentInput,
        definedAt: null
      });
      
      // Execute transformer command
      const cmdVariable = childEnv.getVariable(transformer.identifier);
      if (!cmdVariable || !isCommandVariable(cmdVariable)) {
        throw new Error(`Pipeline transformer not found: ${transformer.identifier}`);
      }
      
      // Invoke the parameterized command with @input
      currentInput = await invokeParameterizedCommand(cmdVariable, { input: currentInput }, childEnv);
      
      // Check for pipeline termination (empty output)
      if (!currentInput || currentInput.trim() === '') {
        return '';
      }
    } catch (error) {
      throw new Error(`Pipeline step ${i + 1} (${transformer.identifier}) failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  return currentInput;
}
```

### Dependency Validation

Create `interpreter/eval/dependency-validator.ts`:

```typescript
interface DependencyChecker {
  checkPackage(packageName: string, versionConstraint: string): Promise<boolean>;
  getInstalledVersion(packageName: string): Promise<string | null>;
}

class NodeDependencyChecker implements DependencyChecker {
  async checkPackage(packageName: string, versionConstraint: string): Promise<boolean> {
    try {
      const installedVersion = await this.getInstalledVersion(packageName);
      if (!installedVersion) return false;
      
      return this.satisfiesConstraint(installedVersion, versionConstraint);
    } catch {
      return false;
    }
  }
  
  async getInstalledVersion(packageName: string): Promise<string | null> {
    try {
      const result = await execAsync(`npm list ${packageName} --depth=0 --json`);
      const parsed = JSON.parse(result.stdout);
      return parsed.dependencies?.[packageName]?.version || null;
    } catch {
      return null;
    }
  }
  
  private satisfiesConstraint(version: string, constraint: string): boolean {
    // Implement version constraint checking (semver-like)
    // Support: exact, >=, ^, *, ranges
    // Use existing semver library or implement basic version comparison
  }
}

class PythonDependencyChecker implements DependencyChecker {
  async checkPackage(packageName: string, versionConstraint: string): Promise<boolean> {
    try {
      const installedVersion = await this.getInstalledVersion(packageName);
      if (!installedVersion) return false;
      
      return this.satisfiesConstraint(installedVersion, versionConstraint);
    } catch {
      return false;
    }
  }
  
  async getInstalledVersion(packageName: string): Promise<string | null> {
    try {
      const result = await execAsync(`pip show ${packageName}`);
      const versionMatch = result.stdout.match(/^Version: (.+)$/m);
      return versionMatch?.[1] || null;
    } catch {
      return null;
    }
  }
  
  private satisfiesConstraint(version: string, constraint: string): boolean {
    // Implement Python-style version constraint checking
  }
}

export async function validateDependencies(
  needs: { [language: string]: { [pkg: string]: string } },
  env: Environment
): Promise<void> {
  const checkers: { [lang: string]: DependencyChecker } = {
    node: new NodeDependencyChecker(),
    python: new PythonDependencyChecker()
  };
  
  for (const [language, packages] of Object.entries(needs)) {
    const checker = checkers[language];
    if (!checker) {
      throw new Error(`Unsupported dependency language: ${language}`);
    }
    
    for (const [packageName, versionConstraint] of Object.entries(packages)) {
      const satisfied = await checker.checkPackage(packageName, versionConstraint);
      if (!satisfied) {
        const installedVersion = await checker.getInstalledVersion(packageName);
        const message = installedVersion
          ? `Dependency version mismatch: ${language} package '${packageName}' requires '${versionConstraint}', found '${installedVersion}'`
          : `Missing dependency: ${language} package '${packageName}@${versionConstraint}'`;
        throw new Error(message);
      }
    }
  }
}
```

## Testing Strategy

### Grammar Tests

Add to `grammar/tests/`:

```typescript
// grammar/tests/with-clause.test.ts
describe('With Clause Grammar', () => {
  test('parses pipeline only', () => {
    const input = 'run [(echo "test")] with { pipeline: [@transform(@input)] }';
    const ast = parseDocument(input);
    
    expect(ast).toMatchObject({
      kind: 'run',
      subtype: 'runCommand',
      values: {
        withClause: {
          pipeline: [
            {
              type: 'commandRef',
              identifier: 'transform'
            }
          ]
        }
      }
    });
  });
  
  test('parses needs only', () => {
    const input = 'run [(node script.js)] with { needs: { "node": { "lodash": "^4.0.0" } } }';
    const ast = parseDocument(input);
    
    expect(ast.values.withClause.needs).toEqual({
      node: { lodash: '^4.0.0' }
    });
  });
  
  test('parses combined pipeline and needs', () => {
    const input = `run [(curl api.com)] with {
      pipeline: [@validate(@input), @parse(@input)],
      needs: { "node": { "jsonschema": ">=1.0.0" } }
    }`;
    const ast = parseDocument(input);
    
    expect(ast.values.withClause).toMatchObject({
      pipeline: expect.arrayContaining([
        expect.objectContaining({ identifier: 'validate' }),
        expect.objectContaining({ identifier: 'parse' })
      ]),
      needs: {
        node: { jsonschema: '>=1.0.0' }
      }
    });
  });
});
```

### Integration Tests

Add test cases to `tests/cases/valid/run/`:

```markdown
<!-- tests/cases/valid/run/with-pipeline/example.md -->
@exec validate_json(data) = run [(echo "@data")]
@exec extract_field(data, field) = run [(echo "extracted")]

@text result = run [(echo '{"users": ["alice", "bob")]}'] with {
  pipeline: [
    @validate_json(@input),
    @extract_field(@input, "users")
  ]
}

@add @result
```

```markdown
<!-- tests/cases/valid/run/with-pipeline/expected.md -->
extracted
```

## Error Handling

### Error Types

Create specialized error classes in `core/errors/`:

```typescript
// core/errors/MlldWithClauseError.ts
export class MlldWithClauseError extends MlldError {
  constructor(
    message: string,
    public readonly clauseType: 'pipeline' | 'needs',
    public readonly step?: string,
    sourceLocation?: SourceLocation
  ) {
    super(message, sourceLocation);
    this.name = 'MlldWithClauseError';
  }
}

export class MlldDependencyError extends MlldWithClauseError {
  constructor(
    message: string,
    public readonly language: string,
    public readonly packageName: string,
    public readonly constraint: string,
    sourceLocation?: SourceLocation
  ) {
    super(message, 'needs', `${language}:${packageName}`, sourceLocation);
    this.name = 'MlldDependencyError';
  }
}

export class MlldPipelineError extends MlldWithClauseError {
  constructor(
    message: string,
    public readonly transformerName: string,
    public readonly stepIndex: number,
    sourceLocation?: SourceLocation
  ) {
    super(message, 'pipeline', transformerName, sourceLocation);
    this.name = 'MlldPipelineError';
  }
}
```

## Performance Considerations

### Caching

- Cache dependency checks within an interpretation session
- Cache pipeline results for identical transformer chains
- Implement dependency check timeout to avoid hanging

### Memory Management

- Stream large data through pipelines when possible
- Limit pipeline depth to prevent stack overflow
- Implement memory limits for transformer outputs

## Implementation Roadmap

1. **Phase 1**: Grammar and AST extensions
2. **Phase 2**: Basic pipeline execution without dependencies
3. **Phase 3**: Dependency validation for Node.js packages
4. **Phase 4**: Python dependency support
5. **Phase 5**: Error handling and user experience improvements
6. **Phase 6**: Performance optimizations and caching

## Comprehensive Examples (Target Design)

### Unified Tail Syntax Across All Contexts

```mlld
# Define exec commands
@exec fetchData(url) = run [(curl @url)]
@exec processJSON(data) = @run python [(json.loads(@data))]
@exec deploy(env) = run [(./scripts/deploy.sh @env)]

# Exec invocations with tail modifiers (no @run wrapper needed)
@text apiResponse = @fetchData("https://api.example.com") | @validateJSON
@text config = @loadConfig() trust always
@text processed = @processJSON(rawData) with { trust: verify, pipeline: [@validate, @transform] }

# In @data assignments  
@data users = @fetchData("api/users") | @parseJSON @extractArray
@data settings = { 
  api: @getEndpoint() trust always,
  key: @fetchData("api/key") | @decrypt
}

# In @when conditions
@when @isProduction => @deploy("prod") trust always
@when @hasErrors() => @alertTeam() | @formatMessage @sendEmail
@when @needsAuth() | @isExpired => @authenticate() with { trust: verify }

# In @output directives
@output @fetchData("api/report") | @generatePDF [report.pdf]
@output @generateDocs() trust always [docs.md]
@output @processJSON(data) with { pipeline: [@format, @minify] } [output.json]

# In @add directives
@add @greeting("World") | @uppercase
@add foreach @processItem(@items) | @format

# Direct @run commands still support tail modifiers
@text cmd = run [(cat config.json)] trust always
@output run [(generate-report)] | @format [report.md]

# Path and import with TTL/trust
@path api = https://internal.api.com/v2 (1h) trust always
@import { utils } from [https://cdn.example.com/utils.mld] (7d) trust verify
@import @corp/internal-tools (static) with { trust: always }
```

## Integration Points

### With foreach

```typescript
// Pipeline transformers work with foreach results
@data files = ["a.json", "b.json"]
@exec process_file(file) = run [(cat @file)] with {
  pipeline: [@validate_json(@input), @extract_data(@input)]
}
@data results = foreach @process_file(@files)
```

### With @when

```typescript
// Conditional pipeline execution
@text response = run [(curl api.com)] with {
  pipeline: [@validate_response(@input)]
}
@when @response => @text data = run [(echo "@response")] with {
  pipeline: [@parse_json(@input)]
}
```

## Built-in Transformers Integration

As of version 1.4.2, mlld includes built-in transformers that work seamlessly with pipelines:

### Using Built-in Transformers

```mlld
# Basic transformer usage
@text formatted = run [(cat data.json)] | @JSON
@text xmlData = run [(cat report.md)] | @XML

# Chaining transformers
@text result = run [(curl api.com/users)] | @json | @csv

# With custom functions
@exec addSummary(data) = ::
# Summary
Total items: {{data.length}}

{{INPUT}}
::

@text report = run [(cat data.json)] | @json | @addSummary | @md
```

### Transformer Implementation

Built-in transformers are registered as special executable variables with metadata:

```typescript
// In Environment.ts
if (commandVar?.metadata?.isBuiltinTransformer) {
  const result = await commandVar.metadata.transformerImplementation(input);
  return String(result);
}
```

Both uppercase (canonical) and lowercase (convenience) versions are available:
- `@XML` / `@xml` - llmxml SCREAMING_SNAKE_CASE conversion
- `@JSON` / `@json` - JSON formatting
- `@CSV` / `@csv` - CSV conversion
- `@MD` / `@md` - Markdown formatting with prettier

## Security Considerations

- Validate all dependency declarations before checking
- Sanitize package names to prevent injection attacks
- Limit dependency checking to trusted package managers
- Implement timeout for dependency checks to prevent DoS