# @when Directive

The `@when` directive provides conditional execution in mlld. It's designed to be extremely limited but powerful - conditions must be predefined commands that return truthy or falsy values, making conditional logic explicit and testable.

## Overview

The `@when` directive evaluates conditions and executes actions based on the results. Unlike traditional programming languages, mlld requires conditions to be predefined using `@exec`, which makes the conditional logic more declarative and easier to test.

## Syntax Forms

### 1. Single-Line Form

The simplest form evaluates a condition and executes an action if true:

```mlld
@when <condition> => <action>
```

Example:
```mlld
@exec is_production() = @run [(echo "$NODE_ENV" | grep -q "production" && echo "true")]
@when @is_production() => @add "⚠️  Running in production mode!"
```

### 2. Block Form with Condition-Action Pairs

The block form allows matching multiple conditions with their corresponding actions:

```mlld
@when <variable> first: [
  <condition1> => <action1>
  <condition2> => <action2>
  <condition3> => <action3>
]
```

This form evaluates conditions in order and executes the action for the **first** matching condition. The optional variable binding captures the condition's output.

Example:
```mlld
@exec get_os() = @run [(uname -s)]
@when @os first: [
  @run [(echo "{{os}}" | grep -q "Darwin")] => @text platform = "macOS"
  @run [(echo "{{os}}" | grep -q "Linux")] => @text platform = "Linux"
  @run [(echo "{{os}}" | grep -q "MINGW\|MSYS")] => @text platform = "Windows"
  @run [(echo "true")] => @text platform = "Unknown"
]
```

### 3. Block Form with Combined Conditions

The block form also supports `all` and `any` modifiers for combining multiple conditions:

#### `any` Modifier
Executes the block action if **any** condition is true:

```mlld
@when any: [
  <condition1>
  <condition2>
  <condition3>
] => <action>
```

Example:
```mlld
@exec has_npm() = @run [(command -v npm >/dev/null && echo "true")]
@exec has_yarn() = @run [(command -v yarn >/dev/null && echo "true")]
@exec has_pnpm() = @run [(command -v pnpm >/dev/null && echo "true")]

@when any: [
  @has_npm()
  @has_yarn()
  @has_pnpm()
] => @add "✓ Package manager found"
```

#### `all` Modifier
Executes actions for **all** conditions that are true:

```mlld
@when all: [
  <condition1> => <action1>
  <condition2> => <action2>
  <condition3> => <action3>
]
```

Example:
```mlld
@data required_files = ["package.json", "README.md", "LICENSE"]
@exec check_file(name) = @run [(test -f "{{name}}" && echo "✓ {{name}}")]

@when all: [
  foreach @check_file(@required_files)
] => @add "All required files present"
```

### 4. Nested @when Blocks

You can nest @when directives for more complex conditional logic:

```mlld
@exec is_ci() = @run [(test -n "$CI" && echo "true")]
@exec is_main_branch() = @run [(git branch --show-current | grep -q "^main$" && echo "true")]

@when @is_ci() => @when @is_main_branch() => @run [(
  echo "Deploying from main branch in CI"
  npm run deploy
)]
```

## Truthiness Model

mlld uses a simple truthiness model for condition evaluation:

**Falsy values:**
- Empty string (`""`)
- String `"false"` (case-insensitive)
- String `"0"`
- Command exit code non-zero
- `null` or `undefined`

**Truthy values:**
- Any non-empty string (except "false" and "0")
- Command exit code 0 with non-empty output

## Common Patterns

### File Existence Checks
```mlld
@exec config_exists() = @run [(test -f config.json && echo "true")]
@when @config_exists() => @add @path [config.json]
```

### Environment Detection
```mlld
@exec is_dev() = @run [(test "$NODE_ENV" = "development" && echo "true")]
@when @is_dev() => @run [(npm run dev)]
```

### Feature Flags
```mlld
@exec feature_enabled(name) = @run [(
  grep -q "{{name}}: true" features.json && echo "true"
)]
@when @feature_enabled("dark-mode") => @add "🌙 Dark mode enabled"
```

### Platform-Specific Logic
```mlld
@exec is_mac() = @run [(uname -s | grep -q "Darwin" && echo "true")]
@exec is_linux() = @run [(uname -s | grep -q "Linux" && echo "true")]

@when @is_mac() => @run [(brew install jq)]
@when @is_linux() => @run [(apt-get install -y jq)]
```

### Validation Chains
```mlld
@exec has_node() = @run [(command -v node >/dev/null && echo "true")]
@exec node_version_ok() = @run [(
  node -v | grep -E "v(18|20|22)" >/dev/null && echo "true"
)]

@when all: [
  @has_node() => @add "✓ Node.js installed"
  @node_version_ok() => @add "✓ Node.js version compatible"
]
```

## Best Practices

1. **Define Clear Conditions**: Use descriptive names for condition commands
   ```mlld
   @exec is_production() = @run [(...)]  # Good
   @exec check() = @run [(...)]          # Too vague
   ```

2. **Keep Conditions Simple**: Each condition should check one thing
   ```mlld
   @exec has_git() = @run [(command -v git >/dev/null && echo "true")]
   @exec is_git_repo() = @run [(git rev-parse --git-dir >/dev/null 2>&1 && echo "true")]
   ```

3. **Provide Fallbacks**: Use `first` modifier with a catch-all
   ```mlld
   @when @result first: [
     @condition1() => @action1
     @condition2() => @action2
     @run [(echo "true")] => @text result = "default"
   ]
   ```

4. **Use Variable Binding**: Capture condition output for use in actions
   ```mlld
   @exec get_version() = @run [(cat VERSION)]
   @when @version first: [
     @run [(echo "{{version}}" | grep -q "^1\.")] => @text major = "1"
     @run [(echo "{{version}}" | grep -q "^2\.")] => @text major = "2"
   ]
   ```

## Limitations

1. **No Direct Commands**: Conditions must be predefined with @exec
   ```mlld
   # NOT SUPPORTED
   @when @run [(test -f file.txt)] => @add "Found"
   
   # CORRECT
   @exec file_exists() = @run [(test -f file.txt && echo "true")]
   @when @file_exists() => @add "Found"
   ```

2. **No Complex Expressions**: No boolean operators (AND, OR, NOT) in conditions
   ```mlld
   # Use 'all' modifier instead of AND
   @when all: [
     @condition1()
     @condition2()
   ] => @action
   
   # Use 'any' modifier instead of OR
   @when any: [
     @condition1()
     @condition2()
   ] => @action
   ```

3. **Sequential Evaluation**: Conditions are evaluated in order, not in parallel

## Error Handling

The `@when` directive handles errors gracefully:

- Failed commands (non-zero exit) are treated as falsy
- Missing commands throw clear errors
- The `any` modifier logs warnings for failed conditions but continues
- The `all` modifier stops on first error

## Integration with Other Features

### With @import
```mlld
@import { is_production } from "./checks.mld"
@when @is_production() => @import { prod_config } from "./config.mld"
```

### With foreach
```mlld
@data services = ["api", "web", "worker"]
@exec service_running(name) = @run [(
  systemctl is-active "{{name}}" >/dev/null && echo "{{name}} ✓"
)]

@when all: [
  foreach @service_running(@services)
]
```

### With Templates
```mlld
@exec get_env() = @run [(echo "$ENVIRONMENT")]
@text message = [[
  Running in {{env}} environment
]]

@when @env first: [
  @run [(echo "{{env}}" | grep -q "prod")] => @add "⚠️  {{message}}"
  @run [(echo "true")] => @add "ℹ️  {{message}}"
]
```

## Comparison with Traditional Conditionals

Unlike traditional if/else statements, mlld's @when:
- Requires explicit condition definitions
- Makes conditions testable and reusable
- Provides clear separation between condition logic and actions
- Supports pattern matching with the `first` modifier
- Enables declarative conditional logic

This design makes mlld scripts more maintainable and easier to debug, as all conditions are named and can be tested independently.