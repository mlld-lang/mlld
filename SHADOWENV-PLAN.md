# Shadow Environment Implementation Plan

## Overview

Implement the `@exec lang = { ... }` syntax to create shadow environments where exec functions can call each other within the same language context. This enables modular, reusable code within mlld by allowing JavaScript/Node functions to directly call other functions defined in the same document.

## Syntax

```mlld
@exec helperA(x) = @run js [(x * 2)]
@exec helperB(x) = @run js [(x * 3)]

# Declare functions available in JS environment
@exec js = { helperA, helperB }

@exec calculate(n) = @run js [(
  // helperA and helperB are now available as regular JS functions
  const a = helperA(n);
  const b = helperB(n);
  return a + b;
)]
```

## Phase 1: Grammar Implementation

### 1.1 Create Environment List Pattern

**File**: `grammar/patterns/lists.peggy`

Add pattern for parsing comma-separated function names:
```peggy
// Environment variable list for @exec env = { ... }
EnvironmentVarList "environment variable list"
  = first:EnvironmentVarReference rest:(_ "," _ ref:EnvironmentVarReference { return ref; })* {
      return [first, ...rest];
    }

// Variable reference without @ prefix
EnvironmentVarReference "environment variable reference"  
  = name:BaseIdentifier {
      return helpers.createNode(NodeType.VariableReference, {
        identifier: name
      }, location());
    }
```

### 1.2 Update Exec Directive

**File**: `grammar/directives/exec.peggy`

Add semantic fork to handle both environment declaration and function definition:
- Parse `@exec identifier`
- If followed by `= {` → Environment declaration
- If followed by `(` or `= @run` → Function definition

Supported language identifiers: `js`, `node`, `python`, `sh`

### 1.3 Expected AST Structure

For `@exec js = { formatDate, parseJSON, helperA }`:

```javascript
{
  type: 'Directive',
  kind: 'exec',
  subtype: 'environment',  // Distinguishes from 'definition'
  values: {
    identifier: [{
      type: 'Text',
      content: 'js'
    }],
    environment: [
      { type: 'VariableReference', identifier: 'formatDate' },
      { type: 'VariableReference', identifier: 'parseJSON' },  
      { type: 'VariableReference', identifier: 'helperA' }
    ]
  }
}
```

## Phase 2: Type System Updates

### 2.1 Add Exec Subtype

**File**: `core/types/nodes.ts`

```typescript
export enum ExecSubtype {
  Definition = 'definition',
  Environment = 'environment'
}
```

### 2.2 Update DirectiveNode Interface

Ensure DirectiveNode can handle the new `environment` values structure.

## Phase 3: Interpreter Implementation

### 3.1 Environment Class Updates

**File**: `interpreter/env/Environment.ts`

Add shadow environment storage and injection:

```typescript
class Environment {
  // Add shadow environment storage
  private shadowEnvs: Map<string, Map<string, any>> = new Map();
  
  // Add method to set shadow environment
  setShadowEnv(language: string, functions: Map<string, any>): void {
    this.shadowEnvs.set(language, functions);
  }
  
  // Update executeCode to inject shadow functions
  async executeCode(
    code: string, 
    language: string, 
    params?: Record<string, any>,
    context?: CommandExecutionContext
  ): Promise<string> {
    // For JS/Node: inject shadow functions as additional parameters
    const shadowEnv = this.shadowEnvs.get(language);
    if (shadowEnv && (language === 'js' || language === 'javascript' || language === 'node')) {
      const shadowNames = [...shadowEnv.keys()];
      const shadowValues = [...shadowEnv.values()];
      
      // Merge with existing params
      const allParamNames = [...(params ? Object.keys(params) : []), ...shadowNames];
      const allParamValues = [...(params ? Object.values(params) : []), ...shadowValues];
      
      // Create function with all parameters
      const fn = new Function(...allParamNames, functionBody);
      let result = fn(...allParamValues);
      
      // Handle promises (existing fix)
      if (result instanceof Promise) {
        result = await result;
      }
    }
  }
}
```

### 3.2 Exec Evaluator Updates

**File**: `interpreter/eval/exec.ts`

Handle environment declarations:

```typescript
export async function evaluateExec(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  if (directive.subtype === 'environment') {
    // Handle @exec js = { ... }
    const language = directive.values.identifier[0].content;
    const envRefs = directive.values.environment;
    
    // Collect functions to inject
    const shadowFunctions = new Map<string, any>();
    
    for (const ref of envRefs) {
      const funcName = ref.identifier;
      const funcVar = env.getVariable(funcName);
      
      if (!funcVar || funcVar.type !== 'command') {
        throw new Error(`${funcName} is not a defined exec function`);
      }
      
      // Create wrapper function that calls the mlld exec
      const wrapper = createExecWrapper(funcName, funcVar, env);
      shadowFunctions.set(funcName, wrapper);
    }
    
    // Store in environment
    env.setShadowEnv(language, shadowFunctions);
    
    return {
      value: null,
      output: ''
    };
  }
  
  // Existing function definition logic...
}
```

### 3.3 Exec Wrapper Function

Bridge JS function calls to mlld exec invocations:

```typescript
function createExecWrapper(
  execName: string, 
  execVar: CommandVariable,
  env: Environment
): Function {
  return async function(...args: any[]) {
    // Convert arguments to mlld exec invocation
    const result = await evaluateExecInvocation(
      execName,
      args,
      execVar,
      env
    );
    
    // Parse result if it looks like JSON
    try {
      return JSON.parse(result);
    } catch {
      return result; // Return as string if not JSON
    }
  };
}
```

## Phase 4: Language-Specific Considerations

### 4.1 JavaScript/Node (✅ Full Implementation)
- **Confidence**: 95%
- **Approach**: Inject as Function parameters
- **Async**: Already handled with Promise detection
- **Status**: Implement fully in this PR

### 4.2 Python (⚠️ Grammar Only)
- **Confidence**: 70%
- **Concerns**: 
  - Python exec() has different scoping rules
  - Import handling complexity
  - String escaping for function definitions
- **Status**: Add grammar support, defer implementation

### 4.3 Shell/Bash (⚠️ Grammar Only)
- **Confidence**: 60%
- **Concerns**:
  - Shell functions aren't first-class values
  - Would need to generate function definitions
  - Parameter passing is positional only
- **Status**: Add grammar support, defer implementation

## Phase 5: Testing Strategy

### 5.1 Basic Functionality Test

```mlld
@exec double(x) = @run js [(x * 2)]
@exec triple(x) = @run js [(x * 3)]

@exec js = { double, triple }

@exec calculate(n) = @run js [(
  return double(n) + triple(n);
)]

@data result = @calculate(5)
@add "Result: @result"  // Should output "Result: 25"
```

### 5.2 Import Integration Test

```mlld
@import { formatDate } from "./utils.mld"

@exec processData(data) = @run js [(
  return data.map(d => ({...d, formatted: true}));
)]

@exec js = { formatDate, processData }

@exec analyze(items) = @run js [(
  const processed = processData(items);
  return processed.map(item => ({
    ...item,
    date: formatDate(item.timestamp)
  }));
)]
```

### 5.3 Error Cases
- Referencing non-existent functions
- Circular dependencies  
- Type mismatches
- Forward references (should work)

## Implementation Checklist

- [ ] Grammar changes for all languages
- [ ] AST type updates
- [ ] Environment class shadow env storage
- [ ] Exec evaluator for environment declarations
- [ ] Wrapper function creation
- [ ] JS/Node full implementation
- [ ] Test suite
- [ ] Documentation updates
- [ ] Error handling and messages

## Success Criteria

1. `@exec js = { ... }` syntax parses correctly
2. JS functions can call other JS functions seamlessly
3. Node functions work identically to JS
4. Clear error messages for missing functions
5. Forward references work (declare env before defining functions)
6. Imported functions can be added to shadow env
7. No performance regression
8. Grammar ready for Python/Shell future implementation

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Namespace pollution | Separate shadow envs per language |
| Security concerns | Only inject explicitly declared functions |
| Performance overhead | Lazy wrapper creation |
| Complex debugging | Clear error messages with function names |
| Circular dependencies | Detect and error appropriately |

## Future Enhancements

1. **Python Implementation**: Handle locals/globals correctly
2. **Shell Implementation**: Generate function definitions
3. **Type checking**: Validate argument counts
4. **Debugging support**: Stack traces through shadow calls
5. **Performance**: Cache compiled wrapper functions

## Timeline

1. **Day 1**: Grammar and type updates
2. **Day 2**: Core interpreter implementation  
3. **Day 3**: Testing and error handling
4. **Day 4**: Documentation and examples
5. **Future**: Python/Shell implementation based on usage