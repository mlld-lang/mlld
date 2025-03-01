# Meld Syntax Audit in Test Files

This document provides a comprehensive audit of all Meld syntax examples used in tests across the codebase. The examples are grouped by syntax type.

## Directive Types

### @text Directive ✅

The `@text` directive defines text variables.

**Correct Syntax:** ✅
```
@text greeting = "Hello"
@text subject = "World"
@text message = `{{greeting}}, {{subject}}!`
@text greeting = `Hello, {{user.name}}! Your ID is {{user.id}}.`
@text appInfo = `{{config.app.name}} v{{config.app.version}}`
@text features = `Features: {{config.app.features}}`
@text docsText = "Docs are at $docs"
@text configText = "Config is at $config"
@text homeText = "Home is at $home"
@text dataText = "Data is at $data"
@text imported = "This content was imported"
@text level3 = "Level 3 imported"
@text level2 = "Level 2 imported"
@text level1 = "Level 1 imported"
@text user = "Alice"
@text variable = "This is a variable"
@text var1 = "Value 1"
@text simple_text = "Hello, world!"
```

**Commented Out (Non-active) Syntax:** ✅
```
# @text myvar = "Not interpreted"
```

### @data Directive ✅

The `@data` directive defines data structures (objects and arrays).

**Correct Syntax:** ✅
```
@data user = { "name": "Alice", "id": 123 }
@data config = { 
  "app": {
    "name": "Meld",
    "version": "1.0.0",
    "features": ["text", "data", "path"]
  },
  "env": "test"
}
@data count = 42
@data person = {
  name: "John Doe",
  age: 30,
  address: {
    street: "123 Main St",
    city: "Anytown"
  }
}
@data fruits = ["apple", "banana", "cherry"]
@data users = [
  { name: "Alice", hobbies: ["reading", "hiking"] },
  { name: "Bob", hobbies: ["gaming", "cooking"] }
]
@data index = 1
```

**Incorrect/Problematic Syntax:** ✅
```
@data bad = { "unclosed": "object"
```

### @path Directive ✅

The `@path` directive defines path variables.

**Correct Syntax:** ✅
```
@path docs = "$PROJECTPATH/docs"
@path config = "$./config"
@path home = "$HOMEPATH/meld"
@path data = "$~/data"
@path templates = "$PROJECTPATH/templates"
```

**Incorrect/Problematic Syntax:** ✅
```
@path bad = "/absolute/path"
@path bad = "../path/with/dot"
```

### @import Directive ✅

The `@import` directive imports content from other Meld files.

**Correct Syntax:** ✅
```
@import [imported.meld]
@import [level3.meld]
@import [level2.meld]
@import [level1.meld]
@import [$templates/variables.meld]
@import "$PROJECTPATH/samples/nested.meld"
@import "$~/examples/basic.meld"
```

**Circular Import Examples (Problematic):** ✅
```
@import [circular2.meld]
@import [circular1.meld]
@import path = "$.project/src/circular2.meld"
@import path = "$.project/src/circular1.meld"
```

### @run Directive ✅

The `@run` directive executes shell commands.

**Correct Syntax:** ✅
```
@run [echo test]
@run [echo {{greeting}}]
@run [echo {{greeting}}, {{name}}!]
@run [echo "This is a simple example"]
@run [echo "Hello from run"]
@run [echo {{param1}} {{param2}}]
@run [echo {{text}}]
@run [$greet]
@run [$greet({{user}})]
@run [echo "Test command"]
@run [ command = "echo test", output = "variable_name" ]
```

### @embed Directive ✅

The `@embed` directive embeds content from external files.

**Correct Syntax:** ✅
```
@embed [embed.md]
@embed [sections.md # Section Two]
@embed [$templates/header.md]
@embed [$templates/footer.md]
@embed [file.txt]
@embed "$PROJECTPATH/README.md"
@embed "$PROJECTPATH/README.md#section"
@embed [ path = "file.md", section = "Section Name", headingLevel = 3, underHeader = "true" ]
```

### @define Directive ✅

The `@define` directive defines commands or functions.

**Correct Syntax:** ✅
```
@define greet = @run [echo "Hello"]
@define greet(name) = @run [echo "Hello, {{name}}!"]
@define hello = "echo 'Hello, World!'"
@define greet(name) = "echo 'Hello, $name!'"
@define complex = { "command": "find", "args": ["-name", "*.js"] }
@define greet = @run [echo "Hello"]
@define greet(name) = @run [echo "Hello {{name}}"]
@define greet(first, last) = @run [echo "Hello {{first}} {{last}}"]
@define greet(name, message) = @run [echo "Hello {{name}}, {{message}}"]
```

## Variable Reference Syntax ✅

### Simple Variable References ✅

**Correct Syntax:** ✅
```
{{greeting}}
{{subject}}
{{user}}
{{variable}}
{{simple_text}}
```

### Object Field Access Syntax ✅

**Correct Syntax:** ✅
```
{{person.name}}
{{person.age}}
{{person.address.street}}
{{person.address.city}}
{{user.name}}
{{user.id}}
{{config.app.name}}
{{config.app.version}}
{{config.app.features}}
```

### Array Access Syntax ✅

**Correct Syntax:** ✅
```
{{fruits[0]}}, {{fruits[1]}}, {{fruits[2]}}
{{users[0].name}}
{{users[0].hobbies[0]}}
{{users[1].name}}
{{users[1].hobbies[1]}}
{{fruits[index]}}
```

### Combined Syntax ✅

**Correct Syntax:** ✅
```
{{greeting}}, {{subject}}!
Hello, {{user.name}}! Your ID is {{user.id}}.
{{config.app.name}} v{{config.app.version}}
Features: {{config.app.features}}
```

## Code Fence Syntax ✅

**Correct Syntax:** ✅
```
```
outer
```

````
outer
```
inner
```
````

```typescript
const x = 1;
```

````typescript
outer
```js
inner
```
````
```

## Test Files Containing Meld Syntax

1. `services/resolution/ResolutionService/ResolutionService.test.ts`
2. `services/resolution/ResolutionService/resolvers/CommandResolver.test.ts`
3. `services/cli/CLIService/CLIService.test.ts`
4. ✅ `services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.test.ts`
5. ✅ `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.test.ts`
6. ✅ `services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.test.ts`
7. `services/pipeline/OutputService/OutputService.test.ts`
8. ✅ `services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.test.ts`
9. `api/api.test.ts`
10. `services/pipeline/ParserService/ParserService.test.ts`
11. `services/pipeline/InterpreterService/InterpreterService.integration.test.ts`
12. `scripts/debug-parser.test.ts`
13. `api/integration.test.ts`
14. `tests/meld-ast-nested-fences.test.ts`
15. `tests/field-access.test.js`

### Additional DirectiveHandler Tests Migrated
16. ✅ `services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.test.ts`
17. ✅ `services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.test.ts`
18. ✅ `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.test.ts`

### Transformation Tests to Consider
1. `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.transformation.test.ts`
2. `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.transformation.test.ts`
3. `services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.transformation.test.ts`

## Migration Status Summary

### DirectiveHandler Tests
- ✅ All handler test files for core directives have been migrated to use centralized syntax:
  - ✅ TextDirectiveHandler
  - ✅ DataDirectiveHandler
  - ✅ PathDirectiveHandler
  - ✅ DefineDirectiveHandler
  - ✅ RunDirectiveHandler
  - ✅ ImportDirectiveHandler
  - ✅ EmbedDirectiveHandler

### Tests Still Needing Migration
- 🔲 Service tests with Meld syntax:
  - 🔲 `services/resolution/ResolutionService/ResolutionService.test.ts`
  - 🔲 `services/resolution/ResolutionService/resolvers/CommandResolver.test.ts`
  - 🔲 `services/cli/CLIService/CLIService.test.ts`
  - 🔲 `services/pipeline/OutputService/OutputService.test.ts`
  - 🔲 `services/pipeline/ParserService/ParserService.test.ts`
  - 🔲 `services/pipeline/InterpreterService/InterpreterService.integration.test.ts`

- 🔲 API and Integration tests:
  - 🔲 `api/api.test.ts`
  - 🔲 `api/integration.test.ts`

### Transformation Tests
- 🔲 DirectiveHandler transformation tests:
  - 🔲 `ImportDirectiveHandler.transformation.test.ts`
  - 🔲 `EmbedDirectiveHandler.transformation.test.ts`
  - 🔲 `RunDirectiveHandler.transformation.test.ts`

## Meld Files Used for Testing

1. `test-array-access.meld`
2. `test-field-access.meld`
3. `examples/field-access-test.meld`
4. `meld-ast-comparison/specific-cases/array-notation-simple.meld`
5. `meld-ast-comparison/specific-cases/array-notation-nested.meld`
6. `meld-ast-comparison/specific-cases/array-variable-index.meld`
7. `examples/absolute-path-test.meld`
8. `examples/api-demo-advanced.meld`
9. `examples/api-demo-simple.meld`
10. `examples/api-demo.meld`
11. `examples/code-fence-test.meld`
12. `examples/data-debug-test.meld`
13. `examples/data-debug.meld`
14. `examples/error-test.meld`
15. `examples/example-import.meld`
16. `examples/example.meld`
17. `examples/field-access-test.meld`
18. `examples/import-workaround.meld`
19. `examples/no-import-test.meld`
20. `examples/simple-test.meld`

## Conclusion

This document provides a comprehensive catalog of all Meld syntax examples found in test files. This information can be used as a reference for consolidating syntax examples into centralized constants.