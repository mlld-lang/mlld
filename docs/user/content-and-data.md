Now I have enough information to create an accurate content-and-data.md document. Based on my analysis of the existing docs and test cases, I'll create a comprehensive document following the guidelines.

# Content and Data

## tldr

Load files with `<file.txt>`, work with data structures using dot notation, transform data with built-in methods, and access environment variables through `@input` imports.

```mlld
/var @config = <config.json>             >> Load and parse JSON
/show @config.database.host              >> Access nested fields
/var @files = <docs/*.md>                >> Load multiple files
/show @files.0.filename                  >> Access file metadata
```

## File Loading

Load file contents with angle brackets `<>`. This loads the actual file content, not the filename string.

```mlld
/var @readme = <README.md>               >> Load file content
/var @filename = "README.md"             >> Literal string

/show @readme                            >> Shows file contents  
/show @filename                          >> Shows "README.md"
```

### Basic Loading

```mlld
>> Load different file types
/var @config = <package.json>            >> JSON file
/var @docs = <README.md>                 >> Markdown file  
/var @script = <build.sh>                >> Shell script
```

### Multiple Files with Globs

Use standard glob patterns to load multiple files:

```mlld
/var @markdown = <*.md>                  >> All .md in current dir
/var @tests = <**/*.test.js>             >> All test files recursively
/var @docs = <docs/**/*.md>              >> All markdown in docs tree
/var @source = <{src,lib}/**/*.ts>       >> Multiple directories

>> Access individual files
/show @docs.0.content                    >> First file's content
/show @docs.0.filename                   >> First file's name
```

### Section Extraction

Extract specific sections from markdown files:

```mlld
>> Extract single section
/var @install = <README.md # Installation>

>> Extract from multiple files  
/var @apis = <docs/*.md # API Reference>

>> Rename sections with 'as'
/var @modules = <*.md # Overview> as "## <>.filename Overview"
```

The `<>` placeholder in `as` templates represents each file's metadata.

## File Metadata

Every loaded file provides metadata through properties:

```mlld
/var @file = <package.json>

>> Basic metadata
/show @file.filename                     >> "package.json"
/show @file.relative                     >> "./package.json" 
/show @file.absolute                     >> Full path

>> Token counting
/show @file.tokest                       >> Estimated tokens (fast)
/show @file.tokens                       >> Exact tokens

>> Content access
/show @file.content                      >> File contents (explicit)
/show @file                              >> Same as above (implicit)
```

### JSON File Metadata

JSON files are automatically parsed:

```mlld
/var @config = <settings.json>

>> Direct field access on parsed JSON
/show @config.json.apiUrl
/show @config.json.users[0].email

>> Raw content still available
/show @config.content                    >> Raw JSON string
```

### Frontmatter Access

Access YAML frontmatter from markdown files:

```mlld
/var @post = <blog/post.md>

/show @post.fm.title                     >> Post title
/show @post.fm.author                    >> Author name
/show @post.fm.tags                      >> Array of tags

>> Conditional processing
/when @post.fm.published => show @post.content
```

## URL Loading

Load content directly from URLs:

```mlld
/var @page = <https://example.com/data.json>

>> URL-specific metadata
/show @page.url                          >> Full URL
/show @page.domain                       >> "example.com"
/show @page.status                       >> HTTP status code
/show @page.title                        >> Page title (if HTML)

>> HTML is converted to markdown
/show @page.content                      >> Markdown version
/show @page.html                         >> Original HTML
```

## Variables and Data Structures

### Creating Variables

Use `/var` to create variables with different data types:

```mlld
>> Primitives
/var @name = "Alice"
/var @age = 30
/var @active = true

>> Arrays
/var @fruits = ["apple", "banana", "cherry"]
/var @numbers = [1, 2, 3, 4, 5]

>> Objects
/var @user = {"name": "Alice", "role": "admin"}
/var @config = {
  "database": {"host": "localhost", "port": 5432},
  "features": ["auth", "api"]
}
```

### Field Access

Access object properties and array elements with dot notation:

```mlld
/var @user = {"name": "Alice", "scores": [10, 20, 30]}

>> Object fields
/show @user.name                         >> "Alice"

>> Array elements by index
/show @user.scores.0                     >> 10
/show @user.scores.1                     >> 20

>> Nested access
/var @config = {"db": {"host": "localhost", "users": ["admin", "guest"]}}
/show @config.db.host                    >> "localhost"
/show @config.db.users.1                 >> "guest"
```

### Array Slicing

Extract subsets of arrays using `[start:end]` syntax:

```mlld
/var @items = ["first", "second", "third", "fourth", "last"]

>> Basic slicing
/show @items[0:3]                        >> ["first", "second", "third"]
/show @items[2:]                         >> ["third", "fourth", "last"]
/show @items[:3]                         >> ["first", "second", "third"]

>> Negative indices
/show @items[-2:]                        >> ["fourth", "last"]
/show @items[:-1]                        >> ["first", "second", "third", "fourth"]
/show @items[1:-1]                       >> ["second", "third", "fourth"]
```

## Built-in Methods

Variables support built-in methods for common operations:

### Array Methods

```mlld
/var @fruits = ["apple", "banana", "cherry"]
/var @numbers = [1, 2, 3, 4, 5]

>> Check if array contains value
/show @fruits.includes("banana")         >> true
/show @fruits.includes("orange")         >> false

>> Find index of value
/show @fruits.indexOf("cherry")          >> 2
/show @fruits.indexOf("missing")         >> -1

>> Get array length
/show @fruits.length()                   >> 3

>> Join array elements
/show @fruits.join(", ")                 >> "apple, banana, cherry"
/show @numbers.join(" | ")               >> "1 | 2 | 3 | 4 | 5"
```

### String Methods

```mlld
/var @text = "Hello World"
/var @phrase = "  JavaScript rocks!  "

>> Check if string contains substring
/show @text.includes("World")            >> true
/show @text.includes("world")            >> false

>> Find substring position
/show @text.indexOf("W")                 >> 6
/show @text.indexOf("xyz")               >> -1

>> Get string length
/show @text.length()                     >> 11

>> Change case
/show @text.toLowerCase()                >> "hello world"
/show @text.toUpperCase()                >> "HELLO WORLD"

>> Trim whitespace
/show @phrase.trim()                     >> "JavaScript rocks!"

>> Check start/end
/show @text.startsWith("Hello")          >> true
/show @text.endsWith("World")            >> true

>> Split into array
/show @text.split(" ")                   >> ["Hello", "World"]
/show @text.split("")                    >> ["H", "e", "l", "l", "o", " ", "W", "o", "r", "l", "d"]
```

## Data Transformations

### Pipeline Transformations

Transform data using the pipeline operator `|`:

```mlld
>> Load and transform files
/var @config = <config.json> | @json
/var @uppercase = <readme.txt> | @upper

>> Chain transformations
/exe @first(text, n) = js { 
  return text.split('\n').slice(0, n).join('\n');
}
/var @summary = <docs.md> | @first(3) | @upper
```

### Built-in Transformers

mlld provides built-in transformers (both uppercase and lowercase work):

```mlld
>> Format JSON with indentation
/var @data = <file.csv>
/var @tojson = @data | @json
/show @tojson

>> Convert to XML (SCREAMING_SNAKE_CASE)
/var @toxml = @data | @XML
/show @toxml

>> Convert arrays to CSV
/var @users = [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]
/var @tocsv = @users | @CSV
/show @tocsv

## Templates and Interpolation

### Template Syntax

Use different template syntaxes for different contexts:

```mlld
/var @name = "Alice"
/var @user = {"role": "admin", "id": 123}

>> Backticks (primary template syntax)
/var @msg1 = `Hello @name!`
/var @msg2 = `User @user.role has ID @user.id`

>> Double colon for escaping backticks
/var @code = ::Use `mlld run` with user @name::

>> Triple colon for many @ symbols (use {{}} syntax)
/var @social = :::Hey @{{name}}, check out {{user.role}}!:::
```

### Interpolation Contexts

Variable interpolation works in specific contexts:

```mlld
>> In directives
/show @name

>> In double quotes
/var @greeting = "Hello @name"

>> In command braces
/run {echo "Welcome @name"}

>> NOT in single quotes (literal)
/var @literal = 'Hello @name'               >> Outputs: Hello @name

>> NOT in plain markdown lines
Hello @name                                 >> Plain text, no interpolation
```

## Environment Variables and Input

### Environment Variable Access

Access environment variables through `@input` imports:

```bash
# Shell
API_KEY=secret123 NODE_ENV=production mlld deploy.mld
```

```mlld
>> Import specific variables
/import { API_KEY, NODE_ENV } from @input
/show `Deploying to @NODE_ENV with key @API_KEY`

>> Import and use in objects
/var @config = {
  "apiKey": @API_KEY,
  "environment": @NODE_ENV,
  "timestamp": @now
}
```

### Stdin Input

Pipe data to mlld via stdin:

```bash
# JSON input
echo '{"version": "1.0.0", "author": "Alice"}' | mlld release.mld

# Text input  
echo "Hello World" | mlld process.mld
```

```mlld
>> Access piped JSON data
/import { version, author } from @input
/show `Release @version by @author`

>> Access piped text (becomes 'content' field)
/import { content } from @input
/show `Received: @content`
```

### Combined Input

Environment variables and stdin are merged:

```bash
echo '{"config": "production"}' | API_KEY=secret mlld deploy.mld
```

```mlld
/import { API_KEY, config } from @input
/show `Deploying @config with key @API_KEY`
```

## Practical Examples

### Documentation Builder

```mlld
>> Collect all module documentation
/var @modules = <modules/**/*.md>

>> Build README with metadata
/var @readme = `# Project Modules

Total modules: @modules.length
Last updated: @now

@modules

`

/output @readme to "README.md"
```

### Token-Aware Processing

```mlld
>> Load files and check context limits
/var @files = <src/**/*.ts>
/var @totalTokens = 0

>> Filter large files
/var @large = foreach @file(@files) {
  /when @file.tokest > 2000 => @file
}

/show `Found @large.length files over 2000 tokens`
/show `Total estimated tokens: @totalTokens`
```

### Data Pipeline

```mlld
>> Process API data
/var @users = run {curl -s api.example.com/users}
/var @parsed = @users | @json

>> Filter active users  
/var @active = foreach @user(@parsed) {
  /when @user.status == "active" => @user
}

>> Generate report
/var @report = `# User Report

Active users: @active.length
Generated: @now

## Users
@active

`

/output @report to "user-report.md"
```

### Configuration Management

```mlld
>> Load environment-specific config
/import { NODE_ENV } from @input
/var @env = @NODE_ENV || "development"

>> Load base config and environment overrides
/var @baseConfig = <config/base.json>
/var @envConfig = <config/@env.json>

>> Merge configurations
/var @config = {
  ...@baseConfig.json,
  ...@envConfig.json,
  "environment": @env,
  "timestamp": @now
}

/output @config to "runtime-config.json" as json
```

## Best Practices

**File Loading:**
- Use globs for multiple files: `<docs/*.md>`
- Check existence: `/when @config => show "Found config"`
- Access metadata for token counting: `@file.tokest`

**Data Access:**
- Prefer dot notation: `@user.name` over complex expressions
- Use slicing for arrays: `@items[0:5]` for first 5 elements
- Check array contents: `@list.includes("item")`

**Templates:**
- Use backticks for simple cases: `` `Hello @name` ``
- Use `::...::` when template contains backticks
- Use `:::...:::` with `{{}}` syntax for many @ symbols

**Environment Variables:**
- Import explicitly: `/import { API_KEY } from @input`
- Provide defaults: `@NODE_ENV || "development"`
- Document required variables in comments
