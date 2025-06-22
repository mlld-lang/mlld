# Grammar README Parse Trees - Updated Section

This shows how the "Directive Parse Trees" section of grammar/README.md should be updated with the new syntax while preserving all semantic logic.

## Directive Parse Trees

**CRITICAL**: Before making ANY grammar changes, you MUST update the relevant parse tree documentation below. The tree must accurately reflect the parsing decisions and semantic choices. This is not optional.

### /run Directive

```
/run ...
├─ Command content
│  ├─ Language keyword detected (js, python, bash, etc.)?
│  │  ├─ YES: Code execution mode
│  │  │  ├─ Check for optional inline arguments?
│  │  │  │  ├─ YES: "/run js (x, y) {return x + y}"
│  │  │  │  │  └─ Inline function with parameters
│  │  │  │  │     ├─ Language specified
│  │  │  │  │     ├─ Arguments for the code
│  │  │  │  │     └─ {code content}
│  │  │  │  │        ├─ Parameters available as @x, @y
│  │  │  │  │        ├─ No other @ variable processing
│  │  │  │  │        ├─ Preserve all {braces} and [brackets]
│  │  │  │  │        └─ Preserve all quotes
│  │  │  │  │
│  │  │  │  └─ NO: "/run js {console.log('test')}"
│  │  │  │     └─ Simple code execution
│  │  │  │        └─ {code content}
│  │  │  │           ├─ No @ variable processing in code
│  │  │  │           ├─ Preserve all {braces} and [brackets]
│  │  │  │           └─ Preserve all quotes
│  │  │  │
│  ├─ "{" detected?
│  │  ├─ YES: "/run {command}"
│  │  │  └─ Command execution mode
│  │  │     └─ CommandParts with @var interpolation
│  │  │        ├─ @var → Variable reference
│  │  │        └─ text → Command text segments
│  │  │
│  ├─ '"' detected?
│  │  ├─ YES: "/run "command with spaces""
│  │  │  └─ Quoted command execution mode
│  │  │     ├─ Double quotes: @var interpolation supported
│  │  │     │  └─ /run "echo Hello @name"
│  │  │     └─ Single quotes: No interpolation
│  │  │        └─ /run 'echo Hello @name' (literal)
│  │  │
│  ├─ "@" detected?
│  │  ├─ YES: "/run @command"
│  │  │  └─ Command reference (exec)
│  │  │
│  └─ Other patterns
│     └─ Parse error (invalid syntax)
│
└─ Tail modifier (optional)?
   ├─ trust <level>
   ├─ | @cmd @cmd → pipeline
   ├─ pipeline [...]
   └─ with { trust: <level>, pipeline: [...], needs: {...} }

Examples:
- /run {echo "Hello"}
- /run "echo Hello World"         # Quoted command (NEW)
- /run 'cat file.txt'            # Single-quoted command (NEW)
- /run js {console.log('test')}
- /run js (x, y) {return x + y}  # Inline function parameters
- /run {rm -rf temp/} trust always
- /run {curl api.com} | @validate @parse
- /run @deploy(prod) trust always
- /run {npm test} with { needs: { node: { jest: "^29.0.0" } } }
```

### Command Parsing Logic Tree

**CRITICAL**: This tree documents the ACTUAL implementation in `patterns/unified-run-content.peggy` as of the current codebase.

```
/run {echo '<div>Hello</div>'}
│
├─ AtRun (directives/run.peggy)
│  ├─ DirectiveMarker "run" ✓
│  ├─ _ (whitespace) ✓
│  └─ UnifiedCommandBrackets
│     ├─ "{" ✓
│     ├─ _ ✓
│     ├─ UnifiedCommandParts
│     │  └─ UnifiedCommandToken* (zero or more tokens)
│     │     │
│     │     ├─ Token Order (first match wins):
│     │     │  1. UnifiedCommandVariable      (@varname)
│     │     │  2. UnifiedCommandQuotedString  ("..." or '...')
│     │     │  3. UnifiedCommandWord          (unquoted text)
│     │     │  4. UnifiedCommandSpace         (whitespace)
│     │     │
│     │     ├─ Parsing "echo '<div>Hello</div>'":
│     │     │  │
│     │     │  ├─ Token 1: "echo"
│     │     │  │  ├─ Try UnifiedCommandVariable → @ not found ✗
│     │     │  │  ├─ Try UnifiedCommandQuotedString → No quote at start ✗
│     │     │  │  └─ Try UnifiedCommandWord → Matches "echo" ✓
│     │     │  │     └─ UnifiedCommandWordChar checks:
│     │     │  │        ├─ Not a quote → continue
│     │     │  │        ├─ Not a space → continue
│     │     │  │        ├─ Not @ → continue
│     │     │  │        ├─ Not } → continue
│     │     │  │        ├─ Security checks pass → ✓
│     │     │  │        └─ Returns: Text node "echo"
│     │     │  │
│     │     │  ├─ Token 2: " "
│     │     │  │  ├─ Try UnifiedCommandVariable → @ not found ✗
│     │     │  │  ├─ Try UnifiedCommandQuotedString → No quote ✗
│     │     │  │  ├─ Try UnifiedCommandWord → Space stops word ✗
│     │     │  │  └─ Try UnifiedCommandSpace → Matches " " ✓
│     │     │  │     └─ Returns: Text node " "
│     │     │  │
│     │     │  └─ Token 3: "'<div>Hello</div>'"
│     │     │     ├─ Try UnifiedCommandVariable → @ not found ✗
│     │     │     └─ Try UnifiedCommandQuotedString → Matches ✓
│     │     │        └─ Single quote detected
│     │     │           └─ UnifiedCommandSingleQuotedContent*
│     │     │              ├─ No variable interpolation
│     │     │              ├─ No security checks inside quotes
│     │     │              └─ Returns: Text node "'<div>Hello</div>'"
│     │     │
│     │     └─ Result: Array of 3 Text nodes
│     │
│     ├─ _ ✓
│     └─ "}" ✓
│
└─ Success: Command parsed with quoted content preserved
```

#### Key Implementation Details

1. **Token-Based Parsing**: Commands are parsed as discrete tokens, not character-by-character
2. **First-Match Semantics**: Peggy commits to the first successful token match
3. **Quote Handling**: Quoted strings are recognized as complete tokens BEFORE security checks
4. **Security Checks**: Only applied to UnifiedCommandWord (unquoted content)
5. **Variable Interpolation**: 
   - Double quotes: Variables are expanded (`"Hello @name"` → `"Hello "` + VariableReference + `""`)
   - Single quotes: No interpolation (`'Hello @name'` → `'Hello @name'`)

#### Why This Works

The token-based approach ensures that:
- Quotes are recognized at token boundaries, not mid-parse
- Security checks only apply to unquoted content
- Shell operators inside quotes are preserved as literal text
- Variable interpolation respects quote semantics

#### Common Misconceptions

1. **Character-by-character parsing**: The old approach that caused issues
2. **Security checks everywhere**: Only in unquoted content (UnifiedCommandWordChar)
3. **Quote consumption**: Quotes are preserved in the output, not consumed

### /text Directive

```
/text @name = ...
├─ "[[" detected?
│  ├─ YES: Template
│  │  └─ [[TemplateContent]]
│  │     └─ {{var}} interpolation only
│  │
├─ "[" detected?
│  ├─ YES: Could be path or section
│  │  ├─ Contains " # "?
│  │  │  ├─ YES: [SectionExtraction]
│  │  │  │  └─ [path # section]
│  │  │  └─ NO: [PathContent]
│  │  │     └─ [/path/to/@var/file]
│  │  │        └─ LOADS FILE CONTENTS
│  │
├─ "@" detected?
│  ├─ YES: Variable or /run
│  │  ├─ @varname → Variable reference
│  │  └─ /run {...} → Direct run command
│  │
├─ "`" detected?
│  ├─ YES: BacktickTemplate
│  │  └─ `TemplateContent with @var`
│  │     └─ @var interpolation (simpler than [[{{var}}]])
│  │
└─ '"' or "'" detected?
   └─ QuotedLiteral
      └─ "simple string" (NO INTERPOLATION, NO FILE LOADING)

Examples:
- /text @greeting = "Hello, world!"
- /text @content = [[Welcome {{user}}!]]
- /text @readme = [./README.md]              # Loads file contents
- /text @link = `[@url.path](@url.name)`     # Backtick with @var interpolation
- /text @data = /run {curl api.com} | @parse # Direct run command
- /text @path = "./config.json"              # String literal, not file load
```

### /data Directive

```
/data @obj = ...
├─ "{" detected?
│  ├─ YES: ObjectLiteral
│  │  └─ { key: DataValue, ... }
│  │     └─ DataValue can be:
│  │        ├─ Primitive: "string", 123, true
│  │        ├─ @variable
│  │        ├─ [path] → Loads file contents
│  │        └─ Nested object/array
│  │
├─ "[" detected?
│  ├─ YES: ArrayLiteral OR Path (context determines)
│  │  ├─ Looks like array? [1, 2, 3]
│  │  │  └─ [DataValue, DataValue, ...]
│  │  └─ Looks like path? [./data.json]
│  │     └─ Loads file contents
│  │
├─ "foreach" detected?
│  ├─ YES: Foreach expression
│  │  └─ foreach @command(@arrays)
│  │
├─ "@" detected?
│  ├─ YES: Variable or /run
│  │  ├─ @varname → Variable reference
│  │  └─ /run {...} → Direct run command
│  │
└─ Other: PrimitiveValue
   └─ String, number, boolean, null

Examples:
- /data @result = /run {cat data.json} | @json
- /data @config = [./config.json]            # Loads JSON file
- /data @paths = { "config": "./config.json", "data": [./data.json] }
- /data @items = foreach @process(@list) | @validate
```

### /exec Directive

```
/exec @name(params) = ...
├─ RHS semantic forking (no /run required):
│  │
│  ├─ Language keyword detected (js, python, bash, etc.)?
│  │  ├─ YES: "/exec @fn(x) = js {code}"
│  │  │  └─ Code execution mode
│  │  │     └─ Language specified before braces
│  │  │        └─ {code content}
│  │  │           ├─ @param references allowed
│  │  │           ├─ No @ variable processing in code
│  │  │           └─ Preserve all brackets and quotes
│  │  │
│  ├─ "{" detected?
│  │  ├─ YES: "/exec @cmd(p) = {command}"
│  │  │  └─ Command execution mode
│  │  │     └─ CommandParts with @param interpolation
│  │  │        ├─ @param → Parameter reference
│  │  │        └─ text → Command text segments
│  │  │
│  ├─ '"' detected?
│  │  ├─ YES: "/exec @cmd(p) = "command @p""
│  │  │  └─ Quoted command execution mode
│  │  │     └─ Same as braces but single line
│  │  │
│  ├─ "[[" detected?
│  │  ├─ YES: "/exec @greeting(name) = [[template]]"
│  │  │  └─ Template executable
│  │  │     └─ [[text with {{param}}]]
│  │  │        └─ {{param}} interpolation in templates
│  │  │
│  ├─ "`" detected?
│  │  ├─ YES: "/exec @msg(name) = `template`"
│  │  │  └─ Backtick template executable
│  │  │     └─ `text with @param`
│  │  │        └─ @param interpolation (simpler syntax)
│  │  │
│  ├─ "[" with " # " pattern?
│  │  ├─ YES: "/exec @getSection(file, section) = [@file # @section]"
│  │  │  └─ Section executable
│  │  │     ├─ [@param # literal] → Extract literal section
│  │  │     ├─ [@param # @param2] → Extract variable section
│  │  │     └─ Optional: as "New Title" → Rename section
│  │  │
│  ├─ "@" without "/"?
│  │  ├─ YES: "/exec @alias() = @other"
│  │  │  └─ Command reference (to another exec)
│  │  │
│  └─ "{" detected for environment?
│     └─ "/exec @js = { helperA, helperB }"
│        └─ Environment declaration (shadow functions)
│
└─ Tail modifier (optional)?
   ├─ trust <level> → Security level
   └─ with { trust: <level>, ... } → Extended modifiers

Examples:
- /exec @deploy(env) = {./deploy.sh @env} trust always
- /exec @deploy(env) = "./deploy.sh @env"    # Quoted command
- /exec @validate(data) = python {validate(@data)}
- /exec @greet(name) = [[Hello {{name}}!]]
- /exec @greet2(name) = `Hello @name!`
- /exec @getIntro(file) = [@file # Introduction]
- /exec @js = { formatDate, parseJSON }
```

### /path Directive

```
/path @var = ...
├─ Path value (NO BRACKETS - paths are references, not content)
│  ├─ '"' detected?
│  │  ├─ YES: DoubleQuotedPath
│  │  │  └─ "path with @var/interpolation"
│  │  │     └─ @var expanded in double quotes
│  │  │
│  ├─ "'" detected?
│  │  ├─ YES: SingleQuotedPath
│  │  │  └─ 'literal path no @var'
│  │  │     └─ No interpolation in single quotes
│  │  │
│  └─ No delimiter?
│     └─ UnquotedPath
│        └─ @var/path/segments
│
├─ TTL (optional)?
│  └─ "(" duration ")"
│     └─ See unified tail syntax tree
│
└─ Tail modifier (optional)?
   ├─ trust <level>
   └─ with { trust: <level>, ... }

Examples:
- /path @config = ./config.json
- /path @api = https://api.com/data (5m)
- /path @secure = @baseUrl/endpoint (1h) trust always
- /path @file = "path with spaces.txt"        # Path string with spaces
- /path @literal = 'no @interpolation here'   # Literal path
```

### /import Directive

```
/import ...
├─ Import pattern?
│  ├─ { imports } from source → Selective import
│  │  ├─ { var1, var2 } → Named imports
│  │  ├─ { var1 as alias1 } → Aliased imports
│  │  └─ { * } → Import all (explicit)
│  │
│  └─ source (no braces) → Import all (implicit)
│
├─ Source types:
│  ├─ @INPUT → Special stdin/pipe input (normalized)
│  ├─ @author/module → Registry module
│  ├─ [@var/path.mld] → Path with variables
│  ├─ [path/to/file.mld] → Local file path
│  ├─ [https://url.com/file] → Remote URL
│  └─ "path/to/file.mld" → Traditional file import
│
├─ TTL (optional after source)?
│  └─ (ttl) → Cache duration
│     ├─ (5000) → Milliseconds
│     ├─ (30s) → Seconds
│     ├─ (5m) → Minutes
│     ├─ (2h) → Hours
│     ├─ (7d) → Days
│     ├─ (2w) → Weeks
│     └─ (static) → Cache forever
│
└─ Tail modifiers (optional)?
   ├─ trust <level> → Security validation
   │  ├─ always → Skip validation
   │  ├─ never → Block entirely
   │  └─ verify → Full validation (default)
   │
   └─ with { ... } → Multiple modifiers
      └─ { trust: <level>, ... }

Full syntax examples:
- /import { x, y } from [path/to/file.mld]
- /import { x as X } from @author/module
- /import [file.mld] (10d) trust always
- /import { * } from [@pathvar/file.mld]
- /import { data } from @INPUT
- /import @corp/utils (static) trust verify
- /import [https://api.com/data.mld] (5m) with { trust: always }
- /import { config } from "./config.mld"      # Traditional syntax
```

### /add Directive

```
/add ...
├─ "foreach" detected? (HIGHEST PRIORITY)
│  ├─ YES: ForeachExpression variants
│  │  ├─ foreach @command(@arrays)
│  │  │  ├─ Traditional command iteration
│  │  │  ├─ Text concatenation mode
│  │  │  ├─ Default separator: "\n"
│  │  │  └─ Tail modifiers supported
│  │  │
│  │  └─ foreach [@array.field # section] as [[template]]
│  │     └─ Section extraction foreach
│  │        ├─ Extract sections from paths
│  │        └─ Apply template to each
│  │
├─ "[" detected?
│  ├─ YES: PathOrSection (ALWAYS LOADS CONTENT)
│  │  │
│  │  ├─ Contains " # "? → Section Extraction
│  │  │  └─ SemanticAddSectionContent
│  │  │     ├─ [path # literal] → Text section identifier
│  │  │     └─ [path # @variable] → Variable section identifier
│  │  │        └─ SectionIdentifier pattern
│  │  │           ├─ @var → VariableReference node
│  │  │           └─ literal → Text node
│  │  │
│  │  └─ No " # " → Regular Path Content
│  │     └─ SemanticPathContent
│  │        └─ [path/with/@vars]
│  │
├─ "[[" detected?
│  ├─ YES: TemplateContent
│  │  └─ [[text with {{vars}}]]
│  │
├─ '"' detected?
│  ├─ YES: Literal text output
│  │  └─ "This text will be output as-is"
│  │
├─ "@" detected?
│  ├─ YES: Variable or invocation
│  │  ├─ @varname → Variable reference
│  │  └─ @command(args) → Exec invocation
│  │
└─ Other patterns
   └─ Parse error (invalid syntax)

Examples:
- /add [file.md # Introduction]        # Load and extract section
- /add [README.md]                     # Load entire file
- /add "This is literal text"          # Output text as-is
- /add [[Welcome {{user}}!]]           # Template output
- /add @greeting                       # Variable output
- /add foreach @process(@items)        # Foreach command
- /add foreach [@files.path # tldr] as [[### {{files.name}}]]  # Section foreach
```

### /output Directive

```
/output ...
├─ "@" detected?
│  ├─ YES: Variable or invocation output
│  │  ├─ /output @var [file.md]
│  │  │  └─ Variable content → file
│  │  │
│  │  └─ /output @invocation(args) [file.md]
│  │     └─ Invocation result → file
│  │
│  └─ Followed by "[" or '"' path?
│     ├─ [path/to/file.md] → Bracketed path
│     └─ "path with spaces.md" → Quoted path
│
├─ '"' string detected?
│  ├─ YES: Output literal text
│  │  └─ /output "text content" [file.md]
│  │     └─ Literal text → file
│  │
├─ "[" path detected (no source)?
│  ├─ YES: Output full document
│  │  └─ /output [file.md]
│  │     └─ Complete document → file
│  │
└─ Other patterns
   └─ Parse error (invalid syntax)

Examples:
- /output [report.md]
- /output @result [output.txt]
- /output "Static content" [static.txt]
- /output @data "output with spaces.txt"
```

### /when Directive

```
/when ...
├─ Condition patterns
│  ├─ Simple: /when @condition => action
│  │  ├─ @condition → Variable/invocation to test
│  │  └─ action → Directive to execute if truthy
│  │
│  ├─ Multi with mode: /when @var mode: [conditions]
│  │  ├─ first: Execute first matching condition only
│  │  ├─ any: Execute all matching conditions
│  │  └─ all: Execute action only if all match
│  │
│  └─ Block action: /when @var: [...] => action
│     └─ Single action for all conditions
│
└─ Actions support full directive syntax
   ├─ Direct exec invocations
   ├─ /run commands
   ├─ /output directives
   ├─ /text assignments
   └─ Any directive

Examples:
- /when @isProduction => /deploy() trust always
- /when @hasData => /output @report [report.md]
- /when @results any: [
    @success => /notify("success"),
    @warning => /logWarning(),
    @error => /alertTeam()
  ]
```

## Grammar Implementation Strategy

### Phase 1: Core Syntax Updates
1. Update DirectiveMarker from "@" to "/"
2. Update command brackets from "[()]" to "{}"
3. Update comment syntax from ">>" to "//"
4. Add quoted command patterns

### Phase 2: Semantic Preservation
1. Ensure all "[...]" patterns continue to mean "dereference/load"
2. Ensure all quoted strings remain literals (no file loading)
3. Maintain clear distinction between path references and content loading

### Phase 3: Testing and Validation
1. Verify AST structure unchanged (except surface syntax)
2. Test semantic distinctions are preserved
3. Ensure no ambiguity in parsing contexts