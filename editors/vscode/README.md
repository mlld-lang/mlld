# mlld for Visual Studio Code

mlld is a modular prompt scripting language, bringing software engineering to LLM workflows: modularity, versioning, and reproducibility.

## What is mlld for?

- makes context and prompt engineering multiplayer and git-versionable
- turns markdown documents into subsection-addressable modules
- public and private modules for prompts and processing
- complex chaining and filtering of LLM calls
- abstract out processing complexity in modules, keep things readable
- get a better handle on the explosion of llm workflow tool cruft

## Here's a simple example

Use mlld to create a daily standup update based on your recent activity:

```mlld
/var @commits = run {git log --since="yesterday"}
/var @prs = run {gh pr list --json title,url,createdAt}

/exe @claude(request) = run {claude -p "@request"}
/exe @formatPRs(items) = js {
  return items.map(pr => `- PR: ${pr.title} (${pr.url})`).join('\n');
}

/var @prompt = `
  Write a standup update in markdown summarizing the work I did 
  yesterday based on the following commits and PRs.

  ## Commits:
  @commits

  ## PRs:
  @formatPRs(@prs)
`
/show @claude(@prompt)
```

## Installation

1. Install mlld CLI:
   ```bash
   npm install -g mlld
   ```

2. Install the VSCode extension:
   - Search for "mlld" in Extensions
   - Or install via command palette: `ext install mlld.mlld-vscode`

## VSCode Features

### Syntax Highlighting

- **Directives**: `/var`, `/show`, `/run`, `/exe`, `/import`, `/when`, `/output`, `/path`
- **Variables**: `@variableName` with field access (`@user.name`)
- **Operators**: `&&`, `||`, `==`, `!=`, `!`, `?:`, `>`, `<`, `>=`, `<=`
- **Templates**: Backticks (`` `text @var` ``), double colons (`::text @var::`), triple colons (`:::text {{var}}:::`)
- **Comments**: `>> Comment text`
- **Embedded code**: JavaScript, Python, Shell with proper syntax highlighting

### Intelligent Language Server

The mlld language server provides advanced IDE features:

- **Autocomplete**:
  - Directives after `/`
  - Variables after `@` with type information
  - Module names in imports
  - File paths in brackets `[...]`
  - Context-aware completions (foreach parameters, with clauses)

- **Go to Definition**: Ctrl/Cmd+Click on variables to jump to their declaration

- **Hover Information**: See variable types, values, and documentation

- **Real-time Validation**: Syntax errors and warnings as you type

- **Multi-file Analysis**: Tracks imports and exports across your project

### Smart File Detection

- `.mlld` and `.mld` files are automatically recognized
- `.md` files switch to mlld mode when directives are detected
- Manual switching via Command Palette: "mlld: Switch to mlld Mode"

## Language Support

### Basic Variables and Expressions

```mlld
/var @name = "Alice"                      # Text variable
/var @count = 42                          # Number
/var @active = true                       # Boolean
/var @data = { "key": "value" }          # JSON data
/var @isValid = @score > 80 && @active   # Expression with operators
/var @level = @isPro ? "premium" : "basic"  # Ternary operator
```

### Templates and Interpolation

```mlld
# Backtick templates (@ interpolation)
/var @greeting = `Hello @name!`

# Double colon templates (useful when content has backticks)
/var @code = ::The function `getData()` returns @value::

# Triple colon templates ({{}} interpolation)
/var @message = :::Dear {{customer}}, your balance is {{amount}}:::
```

### Conditional Logic

```mlld
# Simple conditions
/when @environment == "prod" => /show "Production mode"

# Complex routing with implicit actions
/when @request first: [
  @method == "GET" && @path == "/api" => @response = @getData()
  @method == "POST" => @response = @createItem()
  true => @response = "Not found"
]

# Value-returning when expressions
/var @greeting = when: [
  @hour < 12 => "Good morning"
  @hour < 18 => "Good afternoon"
  true => "Good evening"
]
```

### Command Execution

```mlld
# Shell commands
/run {echo "Hello from shell"}

# JavaScript code
/run js {
  const result = Math.random();
  console.log(result);
  return result;
}

# Python code
/run py {
  import datetime
  print(datetime.datetime.now())
}
```

### Modules and Imports

```mlld
# Import from files
/import { helper, config } from "./utils.mld"

# Import from registry modules
/import { format } from @alice/text-utils

# Import everything
/import * from "./shared.mld"
```

## Extension Settings

Configure mlld behavior in VSCode settings:

- `mlld.enableAutocomplete` - Enable/disable autocomplete features
- `mlld.projectPath` - Override @PROJECTPATH detection
- `mlld.includePaths` - Additional paths for import resolution
- `mlld.languageServer.enable` - Enable/disable language server
- `mlld.languageServer.maxNumberOfProblems` - Maximum diagnostics per file

## Commands

Access via Command Palette (Cmd/Ctrl+Shift+P):

- `mlld: Switch to mlld Mode` - Manually switch current file to mlld
- `mlld: Run Current File` - Execute the current mlld file
- `mlld: Show AST` - Display the Abstract Syntax Tree

## Tips

### Quick Variable Navigation

- Hover over any `@variable` to see its type and value
- Ctrl/Cmd+Click to jump to definition
- Use outline view to see all variables in current file

### Template Selection

- Use backticks for most templates: `` `Hello @name` ``
- Use double colons when content contains backticks: `::Code: `func()` returns @val::`
- Use triple colons for social media style: `:::Hey {{user}}!:::`

### Efficient Imports

The extension provides autocomplete for:
- Local files when typing `[`
- Module names from the registry
- Available exports after `from`

## Troubleshooting

### Language Server Not Starting

Ensure dependencies are installed:
```bash
npm install --save-dev vscode-languageserver
```

### Autocomplete Not Working

1. Check that language server is enabled in settings
2. Ensure file is saved with `.mld` or `.mlld` extension
3. Try reloading the window: Cmd/Ctrl+Shift+P → "Developer: Reload Window"

### Syntax Highlighting Issues

The extension automatically updates syntax definitions from the mlld grammar. If highlighting seems incorrect:
1. Update mlld CLI: `npm update -g mlld`
2. Reload VSCode window
3. Check for extension updates

## Learn More

- [mlld Documentation](https://github.com/mlld-lang/mlld/tree/main/docs)
- [Language Reference](https://github.com/mlld-lang/mlld/blob/main/docs/syntax-reference.md)
- [Module Registry](https://mlld.ai)
- [Report Issues](https://github.com/mlld-lang/mlld/issues)

## Release Notes

### 0.4.0
- Added operator support (&&, ||, ==, !=, !, ?:, comparisons)
- Implicit actions in /when conditions
- Value-returning when expressions
- Improved template syntax highlighting

### 0.3.0
- Full Language Server Protocol support
- Intelligent autocomplete
- Multi-file analysis

### 0.2.0
- Smart file detection for .md files
- Embedded code highlighting

### 0.1.0
- Initial release with syntax highlighting