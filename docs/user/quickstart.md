# Quick Start

Get running with mlld in 5 minutes. 

## Installation

```bash
npm install -g mlld
```

## Your First mlld File

Create `hello.mld` with this content:

```mlld
# My First mlld Script

/var @name = "World"
/show `Hello, @name!`
```

Run it:

```bash
mlld hello.mld
```

Output:
```
Hello, World!
```

## Core Concepts

mlld works by mixing Markdown text with executable directives that start with `/`:

- **Markdown text**: Any line not starting with `/` is plain Markdown
- **Directives**: Lines starting with `/` are mlld commands that do things

## Essential Directives

### Variables with /var

Store data in variables with `@` names:

```mlld
/var @userName = "Alice"
/var @age = 25
/var @skills = ["JavaScript", "Python", "mlld"]
/var @profile = {"role": "developer", "active": true}
```

### Output with /show

Display content using templates with backticks:

```mlld
/var @name = "Bob"
/show `Welcome, @name!`
```

Output:
```
Welcome, Bob!
```

### Commands with /run

Execute shell commands and capture results:

```mlld
/var @currentDir = run {pwd}
/show `Current directory: @currentDir`

/run {echo "Running a quick check..."}
/var @files = run {ls -la | head -5}
/show @files
```

For multi-line scripts, use `run sh`:

```mlld
/run sh {
  echo "Starting process..."
  npm test && echo "Tests passed!" || echo "Tests failed!"
}
```

## Working with Data

### Loading Files

Use angle brackets to load file contents:

```mlld
/var @readme = <README.md>
/show `File contains @readme.length() characters`

/var @config = <package.json>
/show `Project name: @config.name`
```

### Array Operations

Arrays support built-in methods and slicing:

```mlld
/var @items = ["apple", "banana", "cherry", "date"]

# Built-in methods
/show @items.includes("banana")    # true
/show @items.indexOf("cherry")     # 2
/show @items.join(" and ")         # "apple and banana and cherry and date"

# Array slicing
/show @items[0:2]                  # ["apple", "banana"]  
/show @items[1:]                   # ["banana", "cherry", "date"]
/show @items[:-1]                  # ["apple", "banana", "cherry"]
```

### String Operations

Strings also have built-in methods:

```mlld
/var @text = "Hello World"

/show @text.toLowerCase()          # "hello world"
/show @text.includes("World")      # true
/show @text.split(" ")             # ["Hello", "World"]
/show @text.startsWith("Hello")    # true
```

## Control Flow

### Conditionals with /when

Make decisions based on conditions:

```mlld
/var @score = 85
/when @score >= 90 => show "Excellent!"
/when @score >= 70 => show "Good job!"
/when @score < 70 => show "Keep trying!"
```

For multiple conditions, use the array form:

```mlld
/var @role = "admin"
/when first [
  @role == "admin" => show "Full access granted"
  @role == "user" => show "Limited access"
  * => show "Guest access"
]
```

### Loops with /for

Iterate over collections:

```mlld
/var @names = ["Alice", "Bob", "Charlie"]
/for @name in @names => show `Hello, @name!`
```

Create new arrays with transformations:

```mlld
/var @numbers = [1, 2, 3, 4]
/var @doubled = for @n in @numbers => js { return @n * 2 }
/show @doubled  # [2, 4, 6, 8]
```

## Functions with /exe

Create reusable functions:

```mlld
/exe @greet(name, title) = `Hello, @title @name!`
/exe @calculate(x, y) = js { return @x * @y + 10 }

/show @greet("Smith", "Dr.")       # "Hello, Dr. Smith!"
/show @calculate(5, 3)             # 25
```

Template functions for complex formatting:

```mlld
/exe @userCard(user) = ::
**@user.name**
Role: @user.role
Status: @user.active
::

/var @alice = {"name": "Alice", "role": "Developer", "active": true}
/show @userCard(@alice)
```

## File Operations

### Writing Files with /output

Save content to files:

```mlld
/var @report = `System Status: All systems operational at @now`
/output @report to "status.txt"

/var @data = {"timestamp": "@now", "status": "ok"}
/output @data to "status.json" as json
```

### Appending Logs with `/append` and `| append`

Write incremental data or plain text.

```mlld
/var @records = [
  {"id": 1, "status": "ok"},
  {"id": 2, "status": "retry"}
]

/for @record in @records => append @record to "jobs.jsonl"

/show <jobs.jsonl>
```

`.jsonl` targets enforce JSON serialization for each record. Other extensions append raw text. `.json` extensions are blocked to avoid corrupting complete JSON documents.

Any other extension will just append plain text to the file.

You can also use pipes: `| append @result to "file.jsonl"`

### Loading Multiple Files

Use globs to load multiple files:

```mlld
/var @docs = <docs/*.md>
/show `Found @docs.length() documentation files`

# Transform each file with templates
/var @toc = <docs/*.md> as "- [@filename](@relative)"
/show @toc
```

## Operators and Expressions

Use logical, comparison, and ternary operators:

```mlld
/var @isProduction = true
/var @debugMode = false
/var @userCount = 150

# Logical operators
/var @canDeploy = @isProduction && !@debugMode
/show @canDeploy

# Comparison operators  
/var @needsUpgrade = @userCount > 100
/show @needsUpgrade

# Ternary operator
/var @environment = @isProduction ? "prod" : "dev"
/show `Running in @environment environment`

# Complex expressions
/when (@userCount > 100 && @isProduction) || @debugMode => show "High-load monitoring enabled"
```

## Next Steps

Now that you know the basics, explore these topics:

- **[Language Reference](reference.md)** - Syntax guide
- **[Content and Data](content-and-data.md)** - Advanced file loading and data handling
- **[Flow Control](flow-control.md)** - Complex conditionals, loops, and pipelines
- **[Language Reference](reference.md)** - Complete syntax guide
