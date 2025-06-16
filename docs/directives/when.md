# @when Directive

The `@when` directive provides conditional execution in mlld. It evaluates conditions and executes actions based on truthiness.

## Overview

The `@when` directive offers flexible conditional logic with multiple evaluation strategies. Conditions can be variables, command executions, or any expression that produces a truthy/falsy value.

## Syntax Forms

### Quick Reference
- **`@when @var: [...]`** - Evaluates ALL conditions independently, fires action for each true condition
- **`@when @var first: [...]`** - Classic switch (stops at first match)
- **`@when @var all: [...] => action`** - Executes action if ALL conditions are true
- **`@when @var any: [...] => action`** - Executes action if ANY condition is true

### 1. Simple Form (One-line)

The simplest form evaluates a single condition and executes an action if true:

```mlld
@when @condition => @add "This appears if condition is truthy"
```

Example:
```mlld
@text is_production = "true"
@when @is_production => @add "⚠️  Running in production mode!"
```

### 2. Block Form with Modifiers

The block form allows multiple conditions with different evaluation strategies:

#### `first:` - Execute First Match Only

Evaluates conditions in order and executes only the first matching action:

```mlld
@when @variable first: [
  @condition1 => @add "Action 1"
  @condition2 => @add "Action 2"
  @condition3 => @add "Action 3"
]
```

Example:
```mlld
@text env = "production"
@when @env first: [
  @env == "development" => @add "Dev mode"
  @env == "production" => @add "Prod mode"  
  @env == "test" => @add "Test mode"
  "true" => @add "Unknown mode"
]
# Output: Prod mode
```

#### `any:` - Execute if ANY Condition Matches

Checks if any condition is true, then executes a single block action:

```mlld
@when @variable any: [
  @condition1
  @condition2
  @condition3
] => @add "At least one condition matched"
```

Example:
```mlld
@text is_admin = ""
@text is_moderator = "true"
@text is_verified = ""

@when @user any: [
  @is_admin
  @is_moderator
  @is_verified
] => @add "User has elevated privileges"
# Output: User has elevated privileges
```

**Important**: `any:` does NOT support individual actions per condition. Use a block action only.

#### `all:` - Two Different Behaviors

##### With Block Action - ALL Must Match

Executes the block action only if ALL conditions are true:

```mlld
@when @variable all: [
  @condition1
  @condition2
  @condition3
] => @add "All conditions are true"
```

Example:
```mlld
@text has_license = "true"
@text is_active = "yes"
@text is_paid = "1"

@when @user all: [
  @has_license
  @is_active  
  @is_paid
] => @add "Full access granted"
# Output: Full access granted
```

##### With Individual Actions - Execute All Matching

Executes individual actions for each true condition (no ALL requirement):

```mlld
@when @variable all: [
  @condition1 => @add "Action 1"
  @condition2 => @add "Action 2"
  @condition3 => @add "Action 3"
]
```

Example:
```mlld
@text feature_chat = "enabled"
@text feature_video = ""
@text feature_screen = "true"

@when @features all: [
  @feature_chat => @add "Chat is enabled"
  @feature_video => @add "Video is enabled"
  @feature_screen => @add "Screen sharing is enabled"
]
# Output:
# Chat is enabled
# Screen sharing is enabled
```

### 3. Bare Form (No Modifier) 

The bare form without a modifier has two behaviors:

#### With Individual Actions - Execute All Matching (Unique)

This is unique to the bare form - it executes ALL matching conditions:

```mlld
@when @variable: [
  @condition1 => @add "Action 1"
  @condition2 => @add "Action 2"
  @condition3 => @add "Action 3"
]
```

**Important**: This is NOT a switch statement - it intentionally executes ALL matching conditions. For switch-like behavior (stop at first match), use the `first:` modifier.

Example:
```mlld
@text debug = "true"
@text verbose = "yes"
@text trace = ""

@when @config: [
  @debug => @add "Debug mode active"
  @verbose => @add "Verbose logging enabled"
  @trace => @add "Trace logging enabled"
]
# Output:
# Debug mode active
# Verbose logging enabled
```

Unlike `first:`, this executes all matching actions. Unlike `all:` with individual actions, this is the default behavior.

#### With Block Action - Same as `all:`

When using a block action, bare `@when` behaves like `all:`:

```mlld
@when @variable: [
  @condition1
  @condition2
  @condition3
] => @add "All conditions matched"
```

## Multi-line Examples

All forms support multi-line formatting for better readability:

```mlld
# Complex condition checking with first:
@exec get_request_type() = @run bash (
  if [[ "$REQUEST_METHOD" == "GET" && "$REQUEST_PATH" == "/api/users" ]]; then
    echo "list_users"
  elif [[ "$REQUEST_METHOD" == "POST" && "$REQUEST_PATH" == "/api/users" ]]; then
    echo "create_user"
  elif [[ "$REQUEST_METHOD" == "DELETE" && "$REQUEST_PATH" =~ ^/api/users/[0-9]+$ ]]; then
    echo "delete_user"
  fi
)

@when @request_type first: [
  @request_type == "list_users" => 
    @add "Handling GET users request"
  
  @request_type == "create_user" => 
    @add "Creating new user"
  
  @request_type == "delete_user" => 
    @add "Deleting user"
]

# Multiple conditions with any:
@text ip_blocked = ""
@text rate_limit_exceeded = "true"
@text invalid_token = ""

@when @security any: [
  @ip_blocked
  @rate_limit_exceeded
  @invalid_token
] => @add "Access denied: Security policy violation"

# Feature flags with bare form
@text new_ui = "true"
@text beta_features = "true"
@text analytics = ""

@when @flags: [
  @new_ui => 
    @add '''@import { NewHeader, NewFooter } from "./components/new"'''
  
  @beta_features => 
    @add '''@import { BetaTools } from "./components/beta"'''
  
  @analytics => 
    @add '''@import { Analytics } from "./services/analytics"'''
]
```

## Command Execution in Conditions

Conditions can use command execution results:

```mlld
@exec is_installed(cmd) = @run bash (command -v @cmd > /dev/null && echo "true" || echo "")

@when @package_manager first: [
  @is_installed("npm") => @run [npm install]
  @is_installed("yarn") => @run [yarn install]
  @is_installed("pnpm") => @run [pnpm install]
  "true" => @add "No package manager found!"
]
```

## Variable Binding

The optional variable in block form captures the condition value:

```mlld
@text options = "verbose"

@when @mode first: [
  @options == "debug" => @add "Deep debugging: @mode"
  @options == "verbose" => @add "Verbose mode: @mode"
  @options => @add "Basic mode: @mode"
]
```

## Truthiness Rules

Values are considered truthy/falsy as follows:

**Falsy values:**
- `""` (empty string)
- `"false"` (string literal "false", case-insensitive)
- `"0"` (string literal "0")
- `false` (boolean false)
- `null` or `undefined`
- `0` (number zero)

**Truthy values:**
- `"true"` (string literal)
- `true` (boolean true)
- Any non-empty string (except `"false"` and `"0"`)
- Any non-zero number
- Arrays (empty or with elements)
- Objects (empty or with properties)
- Command execution results that return non-empty strings

**Important Notes:**
- String values `"false"` and `"0"` are **falsy** (special cases)
- In switch statements (`@when @var: [...]`), values are compared for equality, not truthiness
- Empty arrays and objects are currently truthy (may change in future versions)

### Negation with `!`

The `!` operator negates the truthiness of a value:

```mlld
@text hasFeature = ""
@when !@hasFeature => @add "Feature is disabled"
# Output: Feature is disabled (empty string is falsy, !falsy is truthy)

@text isDisabled = "false"  
@when !@isDisabled => @add "Not disabled"
# No output (string "false" is truthy, !truthy is falsy)
```

## Common Patterns

### Switch-like Behavior
```mlld
@text command = "build"

@when @command first: [
  @command == "build" => @run [npm run build]
  @command == "test" => @run [npm test]
  @command == "deploy" => @run [npm run deploy]
  "true" => @add "Unknown command: @command"
]
```

### Permission Checking
```mlld
@data user = { "role": "editor", "id": 123 }
@data resource = { "owner_id": 123 }

@when @user any: [
  @user.role == "admin"
  @user.role == "owner"
  @user.id == @resource.owner_id
] => @add "Edit allowed"
```

### Progressive Enhancement
```mlld
@data browser = {
  "supports": {
    "webgl2": true,
    "webgl": true,
    "canvas": true
  }
}

@when @browser: [
  @browser.supports.webgl2 => @add '''@import "./3d-viewer"'''
  @browser.supports.webgl => @add '''@import "./basic-3d"'''
  @browser.supports.canvas => @add '''@import "./2d-viewer"'''
]
```

## Error Messages

The following patterns will produce helpful error messages:

```mlld
# ❌ Error: any: cannot have individual actions
@when @var any: [
  @condition1 => @add "Action 1"
  @condition2 => @add "Action 2"
]

# ❌ Error: all: cannot mix individual actions with block action
@when @var all: [
  @condition1 => @add "Action 1"
  @condition2
] => @add "Block action"

# ✅ Correct: Use block action with any:
@when @var any: [
  @condition1
  @condition2
] => @add "Any condition matched"

# ✅ Correct: Use either individual OR block with all:
@when @var all: [
  @condition1 => @add "Action 1"
  @condition2 => @add "Action 2"
]
```

## Best Practices

1. **Choose the Right Modifier**:
   - Use `first:` for switch-like behavior
   - Use `any:` when you need to check if at least one condition is true
   - Use `all:` with block action when ALL conditions must be true
   - Use `all:` with individual actions to execute multiple independent checks
   - Use bare form for maximum flexibility

2. **Keep Conditions Simple**: Each condition should check one thing
   ```mlld
   @text has_git = "true"
   @text is_git_repo = "true"
   
   # Good: Separate conditions
   @when @repo all: [
     @has_git => @add "Git installed"
     @is_git_repo => @add "In git repository"
   ]
   ```

3. **Provide Fallbacks**: Use `first:` with a catch-all
   ```mlld
   @when @result first: [
     @specific_condition => @add "Specific case"
     @another_condition => @add "Another case"
     "true" => @add "Default case"
   ]
   ```

4. **Use Variable Binding**: Capture condition values for debugging
   ```mlld
   @text version = "2.1.0"
   @when @v first: [
     @version == "1.0.0" => @add "Legacy version: @v"
     @version == "2.0.0" => @add "Current version: @v"
     "true" => @add "Unknown version: @v"
   ]
   ```

## Integration with Other Directives

### With @exec Commands
```mlld
@exec is_ci() = @run bash (test -n "$CI" && echo "true" || echo "")
@exec is_main_branch() = @run bash (git branch --show-current | grep -q "^main$" && echo "true" || echo "")

@when @ci_state all: [
  @is_ci() => @add "Running in CI"
  @is_main_branch() => @add "On main branch"
]
```

### With @import
```mlld
@text environment = "production"
@when @environment first: [
  @environment == "development" => @import { dev_config } from "./config/dev.mld"
  @environment == "production" => @import { prod_config } from "./config/prod.mld"
  @environment == "test" => @import { test_config } from "./config/test.mld"
]
```

### With Templates
```mlld
@text user_type = "premium"
@text greeting[[type]] = [[Welcome, {{type}} user!]]

@when @user_type first: [
  @user_type == "premium" => @add @greeting[[@user_type]]
  @user_type == "basic" => @add "Welcome!"
  "true" => @add "Hello, guest!"
]
```

## Comparison with Traditional Conditionals

Unlike traditional if/else statements, mlld's @when:
- Supports multiple evaluation strategies (first, any, all, bare)
- Makes conditions declarative and testable
- Provides clear separation between condition logic and actions
- Enables pattern matching with the `first:` modifier
- Allows parallel condition checking with bare form

This design makes mlld scripts more maintainable and easier to debug, as conditions are explicit and behavior is predictable.