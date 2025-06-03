# With Clauses Development Guide

> **Status**: Fully implemented on `feature/with-clause` branch, pending merge to main

This guide covers the technical implementation details for the `with` clause feature in mlld, which provides execution modifiers for `@run` and `@exec` commands.

## Overview

With clauses extend command execution with two main capabilities:
1. **Pipelines**: Chain transformations on command output via `@input` variable
2. **Dependencies**: Validate required packages before execution

## Grammar Integration

### AST Extensions

The `with` clause requires extending the Run and Exec directive AST nodes:

```typescript
// In core/types/run.ts
export interface RunCommandDirectiveNode extends RunDirectiveNode {
  subtype: 'runCommand';
  values: {
    command: ContentNodeArray;
    withClause?: WithClauseValues; // New optional field
  };
  raw: {
    command: string;
    withClause?: string; // Raw with clause text
  };
  meta: {
    isMultiLine: boolean;
    hasVariables: boolean;
    withClause?: WithClauseMeta; // Parsed with clause metadata
  };
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

Extend `grammar/directives/run.peggy` and `grammar/directives/exec.peggy`:

```peggy
// In run.peggy
AtRun
  = DirectiveContext "@run" _ security:(SecurityOptions _)? "[" parts:RunCommandParts "]" 
    withClause:(_ WithClause)? comment:InlineComment? {
      // ... existing logic ...
      
      // Add with clause processing
      const withClauseValues = withClause ? withClause[1] : null;
      
      return helpers.createStructuredDirective(
        'run',
        'runCommand',
        {
          command: parts,
          commandBases: commandBases,
          ...(withClauseValues ? { withClause: withClauseValues } : {})
        },
        {
          command: rawCommand,
          commandBases: rawBases,
          ...(withClauseValues ? { withClause: helpers.stringifyWithClause(withClauseValues) } : {})
        },
        {
          isMultiLine: rawCommand.includes('\n'),
          commandCount: commandBases.length,
          hasScriptRunner: false,
          ...helpers.createSecurityMeta(securityOptions),
          ...(withClauseValues ? helpers.createWithClauseMeta(withClauseValues) : {}),
          ...(comment ? { comment } : {})
        },
        location(),
        'command'
      );
    }

// With clause grammar
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
    const input = '@run [(echo "test")] with { pipeline: [@transform(@input)] }';
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
    const input = '@run [(node script.js)] with { needs: { "node": { "lodash": "^4.0.0" } } }';
    const ast = parseDocument(input);
    
    expect(ast.values.withClause.needs).toEqual({
      node: { lodash: '^4.0.0' }
    });
  });
  
  test('parses combined pipeline and needs', () => {
    const input = `@run [(curl api.com)] with {
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
@exec validate_json(data) = @run [(echo "@data")]
@exec extract_field(data, field) = @run [(echo "extracted")]

@text result = @run [(echo '{"users": ["alice", "bob")]}'] with {
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

## Integration Points

### With foreach

```typescript
// Pipeline transformers work with foreach results
@data files = ["a.json", "b.json"]
@exec process_file(file) = @run [(cat @file)] with {
  pipeline: [@validate_json(@input), @extract_data(@input)]
}
@data results = foreach @process_file(@files)
```

### With @when

```typescript
// Conditional pipeline execution
@text response = @run [(curl api.com)] with {
  pipeline: [@validate_response(@input)]
}
@when @response => @text data = @run [(echo "@response")] with {
  pipeline: [@parse_json(@input)]
}
```

## Security Considerations

- Validate all dependency declarations before checking
- Sanitize package names to prevent injection attacks
- Limit dependency checking to trusted package managers
- Implement timeout for dependency checks to prevent DoS