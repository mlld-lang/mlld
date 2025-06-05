# Feature Verification Checklist for LLM Onboarding Document

## Core Concepts
- [ ] MLLD only executes lines starting with @ directives
- [ ] Everything else is literal Markdown
- [ ] Two modes: Markdown mode (default) and MLLD mode

## Syntax Rules (10 Commandments)

### 1. Directives Must Start Lines
- [ ] `@add` in middle of line doesn't work
- [ ] Directives must be at beginning of line

### 2. Variable Creation vs Reference
- [ ] Create variables without @ prefix: `@text name = "Alice"`
- [ ] Reference with @ in directives: `@add @name`
- [ ] Reference with {{}} in templates: `[[Hello {{name}}!]]`
- [ ] Reference with @ in commands: `[echo "@name"]`

### 3. Commands Require Brackets
- [ ] `@run echo "hello"` is invalid
- [ ] `@run [(echo "hello")]` is valid (note the parentheses)
- [ ] `@run js [(console.log("hello"))]` with language outside brackets

### 4. Only @add and @run Produce Output
- [ ] @text doesn't produce output
- [ ] @data doesn't produce output
- [ ] @add produces output
- [ ] @run produces output

### 5. Context-Specific Variable Syntax
- [ ] String literals: `"literal text for @var"`
- [ ] Command context: `[echo "@var"]` (@ prefix inside brackets)
- [ ] Template context: `[[template with {{var}}]]`

### 6. Field Access Rules
- [ ] Dot notation in directives: `@user.name`
- [ ] Array access with dot: `@user.scores.1`
- [ ] Template field access: `{{user.name}}`
- [ ] Template array access: `{{user.scores.0}}`

### 7. Parameterized Content
- [ ] @exec for parameterized commands: `@exec greet(name) = @run [(echo "Hello @name")]`
- [ ] Calling exec functions: `@run @greet("Alice")`
- [ ] @text for parameterized templates: `@text welcome(name, role) = [[Welcome {{name}}!]]`
- [ ] Calling text templates: `@add @welcome("Bob", "developer")`

### 8. Import Patterns
- [ ] Local files with quotes: `@import { helper } from "./utils.mld"`
- [ ] .mld extension required for local files
- [ ] Registry modules without quotes: `@import { parallel } from @mlld/core`
- [ ] @ prefix for registry modules

### 9. Conditional Logic
- [ ] Simple conditional: `@when @condition => @action`
- [ ] Multiple conditions with first: `@when @var first: [...]`
- [ ] Condition syntax with comparisons: `@score > 90 => @add "text"`

### 10. Iteration with foreach
- [ ] foreach with text templates: `foreach @greetTemplate(@names)`
- [ ] Result is always array
- [ ] Works with @exec commands too

## Additional Claims
- [ ] @run can specify language: `@run js [...]`
- [ ] Module syntax: `@import from @author/module`
- [ ] Frontmatter support (YAML header)
- [ ] Comments in MLLD (# comments shown in examples)
- [ ] Object literal syntax in @data
- [ ] Function calls in modules: `@parallel(@tasks, { concurrency: 5 })`

## Confidence Assessment Scale
- 100%: Verified in both docs and code with tests
- 95%: Clear documentation and code implementation
- 90%: Code implementation clear, docs less explicit
- 80%: Found in examples but not explicit docs
- 70%: Inferred from code patterns
- <70%: Unclear or conflicting information