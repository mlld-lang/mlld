# /when Directive

The `/when` directive provides conditional execution in mlld. It evaluates conditions and executes actions based on truthiness.

## Overview

The `/when` directive provides conditional logic with multiple evaluation strategies. Conditions can be variables, command executions, or any expression that produces a truthy/falsy value.

## Syntax Forms

### Quick Reference
- **`/when @var: [...]`** - Evaluates ALL conditions independently, fires action for each true condition
- **`/when @var first: [...]`** - Classic switch (stops at first match)
- **`/when @var all: [...] => action`** - Executes action if ALL conditions are true
- **`/when @var any: [...] => action`** - Executes action if ANY condition is true

### 1. Simple Form (One-line)

The simplest form evaluates a single condition and executes an action if true:

```mlld
/when @condition => /show "This appears if condition is truthy"
```

Conditions can use operators for complex logic:
```mlld
# Using comparison operators
/when @score > 90 => /show "Excellent!"
/when @user.role == "admin" => /show "Admin access granted"

# Using logical operators
/when @isActive && @hasPermission => /show "Access allowed"
/when @isDev || @isStaging => /show "Non-production environment"

# Using negation
/when !@isLocked => /show "Resource available"

# Complex expressions with parentheses
/when (@role == "admin" || @role == "mod") && @active => /show "Privileged user"
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
  "development" => /show "Dev mode"
  "production" => /show "Prod mode"  
  "test" => /show "Test mode"
  _ => /show "Unknown mode"
]
# Output: Prod mode
```

#### Implicit Actions (Directive Prefix Optional)

Within `/when` blocks, you can omit directive prefixes for cleaner syntax:

```mlld
# Explicit form (traditional)
/when @env first: [
  "dev" => /var @config = "development.json"
  "prod" => /var @config = "production.json"
]

# Implicit form (cleaner)
/when @env first: [
  "dev" => @config = "development.json"      # Implicit /var
  "prod" => @config = "production.json"     # Implicit /var
]

# Works with all action types
/when @task first: [
  "build" => @compile()                      # Implicit /run
  "test" => @runTests()                      # Implicit /run  
  "deploy" => @deploy() = @buildAndPush()    # Implicit /exe
]
```

#### `any:` - Execute if ANY Condition Matches

Checks if any condition is true, then executes a single block action:

```mlld
/when @variable any: [
  @condition1
  @condition2
  @condition3
] => /show "At least one condition matched"
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
] => /show "User has elevated privileges"
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
] => /show "All conditions are true"
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
] => /show "Full access granted"
# Output: Full access granted
```

##### With Individual Actions - Execute All Matching

Executes individual actions for each true condition (no ALL requirement):

```mlld
/when @variable all: [
  @condition1 => /show "Action 1"
  @condition2 => /show "Action 2"
  @condition3 => /show "Action 3"
]
```

Example:
```mlld
/var @feature_chat = "enabled"
/var @feature_video = ""
/var @feature_screen = "true"

/when @features all: [
  @feature_chat => /show "Chat is enabled"
  @feature_video => /show "Video is enabled"
  @feature_screen => /show "Screen sharing is enabled"
]
# Output:
# Chat is enabled
# Screen sharing is enabled
```

##### Implicit Actions in Blocks

```mlld
# Mixed implicit and explicit actions
/when @mode all: [
  @debug => @logLevel = "debug"              # Implicit /var
  @verbose => /show "Verbose mode"           # Explicit /show
  @trace => @enableTrace()                   # Implicit /run
]
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
  if :: "$REQUEST_METHOD" == "GET" && "$REQUEST_PATH" == "/api/users" ::; then
    echo "list_users"
  elif :: "$REQUEST_METHOD" == "POST" && "$REQUEST_PATH" == "/api/users" ::; then
    echo "create_user"
  elif :: "$REQUEST_METHOD" == "DELETE" && "$REQUEST_PATH" =~ ^/api/users/[0-9]+$ ::; then
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
    /show ::/import { NewHeader, NewFooter } from "./components/new"::
  
  @beta_features => 
    /show ::/import { BetaTools } from "./components/beta"::
  
  @analytics => 
    /show ::/import { Analytics } from "./services/analytics"::
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

## Using Operators in Conditions

Conditions can use the full range of mlld operators:

### Comparison Operators
```mlld
/when @score > 90 => /show "A grade"
/when @age >= 18 => /show "Adult"
/when @status == "active" => /show "Account is active"
/when @result != null => /show "Has result"
```

### Logical Operators
```mlld
# AND operator (short-circuits)
/when @isLoggedIn && @hasSubscription => /show "Premium content"

# OR operator (short-circuits)  
/when @isOwner || @isAdmin => /show "Can edit"

# NOT operator
/when !@isExpired => /show "Still valid"

# Complex expressions
/when (@score > 80 && @completed) || @isExempt => /show "Passed"
```

### In Block Forms
```mlld
/when @request first: [
  @method == "GET" && @path == "/users" => /show "List users"
  @method == "POST" && @path == "/users" => /show "Create user"
  @method == "DELETE" && @path != "/users" => /show "Delete specific resource"
]
```

## Truthiness Rules

Values are considered truthy/falsy as follows:

**Falsy values:**
- `""` (empty string)
- `false` (boolean false)
- `null` or `undefined`
- `0` (number zero)
- `[]` (empty array - unlike JavaScript!)
- `{}` (empty object - unlike JavaScript!)

**Truthy values:**
- Any non-empty string
- `true` (boolean true)
- Any non-zero number
- Non-empty arrays
- Non-empty objects

**mlld Type Coercion:**
- `"true" == true` → true
- `"false" == false` → true
- `null == undefined` → true
- Numbers compared numerically: `"5" == 5` → true

### Ternary Operator in Actions

While conditions use standard operators, actions can use the ternary operator:

```mlld
/when @user.type == "premium" => /var @message = @isWeekend ? "Enjoy your weekend!" : "Have a productive day!"
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
  @browser.supports.webgl2 => /add ::/import { Viewer3D } from "./3d-viewer"::
  @browser.supports.webgl => /add ::/import { Basic3D } from "./basic-3d"::
  @browser.supports.canvas => /add ::/import { Viewer2D } from "./2d-viewer"::
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
/exe @greeting(type) = :::Welcome, {{type}} user!:::

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