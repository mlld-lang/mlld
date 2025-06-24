# /when Directive

The `/when` directive provides conditional execution in mlld. It evaluates conditions and executes actions based on truthiness.

## Overview

The `/when` directive offers flexible conditional logic with multiple evaluation strategies. Conditions can be variables, command executions, or any expression that produces a truthy/falsy value.

## Syntax Forms

### Quick Reference
- **`/when @var: [...]`** - Evaluates ALL conditions independently, fires action for each true condition
- **`/when @var first: [...]`** - Classic switch (stops at first match)
- **`/when @var all: [...] => action`** - Executes action if ALL conditions are true
- **`/when @var any: [...] => action`** - Executes action if ANY condition is true

### 1. Simple Form (One-line)

The simplest form evaluates a single condition and executes an action if true:

```mlld
/when @condition => /add "This appears if condition is truthy"
```

Example:
```mlld
/var @is_production = "true"
/when @is_production => /add "⚠️  Running in production mode!"
```

### 2. Block Form with Modifiers

The block form allows multiple conditions with different evaluation strategies:

#### `first:` - Execute First Match Only

Evaluates conditions in order and executes only the first matching action:

```mlld
/when @variable first: [
  @condition1 => /add "Action 1"
  @condition2 => /add "Action 2"
  @condition3 => /add "Action 3"
]
```

Example:
```mlld
/var @env = "production"
/when @env first: [
  "development" => /add "Dev mode"
  "production" => /add "Prod mode"  
  "test" => /add "Test mode"
  _ => /add "Unknown mode"
]
# Output: Prod mode
```

#### `any:` - Execute if ANY Condition Matches

Checks if any condition is true, then executes a single block action:

```mlld
/when @variable any: [
  @condition1
  @condition2
  @condition3
] => /add "At least one condition matched"
```

Example:
```mlld
/var @is_admin = ""
/var @is_moderator = "true"
/var @is_verified = ""

/when @user any: [
  @is_admin
  @is_moderator
  @is_verified
] => /add "User has elevated privileges"
# Output: User has elevated privileges
```

**Important**: `any:` does NOT support individual actions per condition. Use a block action only.

#### `all:` - Two Different Behaviors

##### With Block Action - ALL Must Match

Executes the block action only if ALL conditions are true:

```mlld
/when @variable all: [
  @condition1
  @condition2
  @condition3
] => /add "All conditions are true"
```

Example:
```mlld
/var @has_license = "true"
/var @is_active = "yes"
/var @is_paid = "1"

/when @user all: [
  @has_license
  @is_active  
  @is_paid
] => /add "Full access granted"
# Output: Full access granted
```

##### With Individual Actions - Execute All Matching

Executes individual actions for each true condition (no ALL requirement):

```mlld
/when @variable all: [
  @condition1 => /add "Action 1"
  @condition2 => /add "Action 2"
  @condition3 => /add "Action 3"
]
```

Example:
```mlld
/var @feature_chat = "enabled"
/var @feature_video = ""
/var @feature_screen = "true"

/when @features all: [
  @feature_chat => /add "Chat is enabled"
  @feature_video => /add "Video is enabled"
  @feature_screen => /add "Screen sharing is enabled"
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
/when @variable: [
  @condition1 => /add "Action 1"
  @condition2 => /add "Action 2"
  @condition3 => /add "Action 3"
]
```

**Important**: This is NOT a switch statement - it intentionally executes ALL matching conditions. For switch-like behavior (stop at first match), use the `first:` modifier.

Example:
```mlld
/var @debug = "true"
/var @verbose = "yes"
/var @trace = ""

/when @config: [
  @debug => /add "Debug mode active"
  @verbose => /add "Verbose logging enabled"
  @trace => /add "Trace logging enabled"
]
# Output:
# Debug mode active
# Verbose logging enabled
```

Unlike `first:`, this executes all matching actions. Unlike `all:` with individual actions, this is the default behavior.

#### With Block Action - Same as `all:`

When using a block action, bare `/when` behaves like `all:`:

```mlld
/when @variable: [
  @condition1
  @condition2
  @condition3
] => /add "All conditions matched"
```

## Multi-line Examples

All forms support multi-line formatting for better readability:

```mlld
# Complex condition checking with first:
/exe @get_request_type() = bash {
  if [[ "$REQUEST_METHOD" == "GET" && "$REQUEST_PATH" == "/api/users" ]]; then
    echo "list_users"
  elif [[ "$REQUEST_METHOD" == "POST" && "$REQUEST_PATH" == "/api/users" ]]; then
    echo "create_user"
  elif [[ "$REQUEST_METHOD" == "DELETE" && "$REQUEST_PATH" =~ ^/api/users/[0-9]+$ ]]; then
    echo "delete_user"
  fi
}

/var @request_type = /run @get_request_type()
/when @request_type first: [
  "list_users" => 
    /show "Handling GET users request"
  
  "create_user" => 
    /show "Creating new user"
  
  "delete_user" => 
    /show "Deleting user"
]

# Multiple conditions with any:
/var @ip_blocked = ""
/var @rate_limit_exceeded = "true"
/var @invalid_token = ""

/when @security any: [
  @ip_blocked
  @rate_limit_exceeded
  @invalid_token
] => /add "Access denied: Security policy violation"

# Feature flags with bare form
/var @new_ui = "true"
/var @beta_features = "true"
/var @analytics = ""

/when @flags: [
  @new_ui => 
    /show [[/import { NewHeader, NewFooter } from "./components/new"]]
  
  @beta_features => 
    /show [[/import { BetaTools } from "./components/beta"]]
  
  @analytics => 
    /show [[/import { Analytics } from "./services/analytics"]]
]
```

## Command Execution in Conditions

Conditions can use command execution results:

```mlld
/exe @is_installed(cmd) = bash {command -v @cmd > /dev/null && echo "true" || echo ""}

/when @package_manager first: [
  @is_installed("npm") => /run "npm install"
  @is_installed("yarn") => /run "yarn install"
  @is_installed("pnpm") => /run "pnpm install"
  _ => /add "No package manager found!"
]
```

## Variable Binding

The optional variable in block form captures the condition value:

```mlld
/var @options = "verbose"

/when @options first: [
  "debug" => /add "Deep debugging mode"
  "verbose" => /add "Verbose mode active"
  _ => /add "Basic mode"
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
/var @hasFeature = ""
/when !@hasFeature => /add "Feature is disabled"
# Output: Feature is disabled (empty string is falsy, !falsy is truthy)

/var @isDisabled = "false"  
/when !@isDisabled => /add "Not disabled"
# No output (string "false" is falsy, !falsy is truthy)
```

## Common Patterns

### Switch-like Behavior
```mlld
/var @command = "build"

/when @command first: [
  "build" => /run "npm run build"
  "test" => /run "npm test"
  "deploy" => /run "npm run deploy"
  _ => /add "Unknown command: @command"
]
```

### Permission Checking
```mlld
/var @user = { "role": "editor", "id": 123 }
/var @resource = { "owner_id": 123 }

/exe @is_admin() = js {return @user.role === "admin" ? "true" : ""}
/exe @is_owner() = js {return @user.role === "owner" ? "true" : ""}
/exe @owns_resource() = js {return @user.id === @resource.owner_id ? "true" : ""}

/when @permission any: [
  @is_admin()
  @is_owner()
  @owns_resource()
] => /add "Edit allowed"
```

### Progressive Enhancement
```mlld
/var @browser = {
  "supports": {
    "webgl2": true,
    "webgl": true,
    "canvas": true
  }
}

/when @browser: [
  @browser.supports.webgl2 => /add [[/import { Viewer3D } from "./3d-viewer"]]
  @browser.supports.webgl => /add [[/import { Basic3D } from "./basic-3d"]]
  @browser.supports.canvas => /add [[/import { Viewer2D } from "./2d-viewer"]]
]
```

## Error Messages

The following patterns will produce helpful error messages:

```mlld
# ❌ Error: any: cannot have individual actions
/when @var any: [
  @condition1 => /add "Action 1"
  @condition2 => /add "Action 2"
]

# ❌ Error: all: cannot mix individual actions with block action
/when @var all: [
  @condition1 => /add "Action 1"
  @condition2
] => /add "Block action"

# ✅ Correct: Use block action with any:
/when @var any: [
  @condition1
  @condition2
] => /add "Any condition matched"

# ✅ Correct: Use either individual OR block with all:
/when @var all: [
  @condition1 => /add "Action 1"
  @condition2 => /add "Action 2"
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
   /var @has_git = "true"
   /var @is_git_repo = "true"
   
   # Good: Separate conditions
   /when @repo all: [
     @has_git => /add "Git installed"
     @is_git_repo => /add "In git repository"
   ]
   ```

3. **Provide Fallbacks**: Use `first:` with a catch-all
   ```mlld
   /when @result first: [
     @specific_condition => /add "Specific case"
     @another_condition => /add "Another case"
     _ => /add "Default case"
   ]
   ```

4. **Use Meaningful Conditions**: Make conditions readable
   ```mlld
   /var @version = "2.1.0"
   /when @version first: [
     "1.0.0" => /add "Legacy version"
     "2.0.0" => /add "Current version"
     _ => /add "Unknown version: @version"
   ]
   ```

## Integration with Other Directives

### With /exec Commands
```mlld
/exe @is_ci() = bash {test -n "$CI" && echo "true" || echo ""}
/exe @is_main_branch() = bash {git branch --show-current | grep -q "^main$" && echo "true" || echo ""}

/when @ci_state all: [
  @is_ci() => /add "Running in CI"
  @is_main_branch() => /add "On main branch"
]
```

### With /import
```mlld
/var @environment = "production"
/when @environment first: [
  "development" => /import { dev_config } from "./config/dev.mld"
  "production" => /import { prod_config } from "./config/prod.mld"
  "test" => /import { test_config } from "./config/test.mld"
]
```

### With Templates
```mlld
/var @user_type = "premium"
/exe @greeting(type) = [[Welcome, {{type}} user!]]

/when @user_type first: [
  "premium" => /add @greeting("premium")
  "basic" => /add "Welcome!"
  _ => /add "Hello, guest!"
]
```

## Comparison with Traditional Conditionals

Unlike traditional if/else statements, mlld's /when:
- Supports multiple evaluation strategies (first, any, all, bare)
- Makes conditions declarative and testable
- Provides clear separation between condition logic and actions
- Enables pattern matching with the `first:` modifier
- Allows parallel condition checking with bare form

This design makes mlld scripts more maintainable and easier to debug, as conditions are explicit and behavior is predictable.