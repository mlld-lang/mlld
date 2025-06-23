# Environment Variables and Input

mlld provides access to environment variables and stdin input through the `@INPUT` system, allowing you to create dynamic, configurable scripts.

## Environment Variables

Environment variables passed to mlld are automatically available through `@INPUT` imports:

```bash
API_KEY=secret123 DATABASE_URL=postgres://localhost mlld deploy.mld
```

```mlld
/import { API_KEY, DATABASE_URL } from @input
/text @config = [[API Key: {{API_KEY}}, Database: {{DATABASE_URL}}]]
/add @config
```

### How It Works

- **All environment variables** passed to mlld are available via `@input` imports
- No filtering or magic - what you pass is what you get
- Environment variables are merged with any stdin input
- Works with both `@input` and `@INPUT` syntax (case-insensitive)

### Examples

**Single variable:**
```bash
NODE_ENV=production mlld build.mld
```

```mlld
/import { NODE_ENV } from @input
/text @env = [[Building for: {{NODE_ENV}}]]
/add @env
```

**Multiple variables:**
```bash
API_KEY=abc123 DB_HOST=localhost DB_PORT=5432 mlld app.mld
```

```mlld
/import { API_KEY, DB_HOST, DB_PORT } from @input
/text @dbUrl = [[postgres://{{DB_HOST}}:{{DB_PORT}}/myapp]]
/add @dbUrl
```

## Stdin Input

You can also pipe data to mlld via stdin, which becomes available through `@INPUT`:

**JSON input:**
```bash
echo '{"version": "1.0.0", "author": "Alice"}' | mlld release.mld
```

```mlld
/import { version, author } from @input
/text @release = [[Release {{version}} by {{author}}]]
/add @release
```

**Plain text input:**
```bash
echo "Hello World" | mlld process.mld
```

```mlld
/import { content } from @input
/add [[Received: {{content}}]]
```

## Combining Environment Variables and Stdin

When both environment variables and stdin are present, they're merged together:

```bash
echo '{"config": "production"}' | API_KEY=secret123 mlld deploy.mld
```

```mlld
/import { API_KEY, config } from @input
/text @deployment = [[Deploying {{config}} with key {{API_KEY}}]]
/add @deployment
```

### Merging Rules

- **JSON stdin + env vars**: Environment variables are added to the JSON object
- **Text stdin + env vars**: Text becomes `content` field, env vars are added alongside
- **Environment variables take precedence** over stdin fields with the same name

## Direct @INPUT Access

You can also access the entire input object directly:

```bash
DEBUG=true API_KEY=secret mlld debug.mld
```

```mlld
/add @INPUT
```

This outputs all available environment variables and stdin data as JSON.

## Field Access

Environment variables support field access for complex data:

```bash
USER_DATA='{"name": "Alice", "role": "admin"}' mlld user.mld
```

```mlld
/import { USER_DATA } from @input
/text @welcome = [[Welcome {{USER_DATA.name}} ({{USER_DATA.role}})]]
/add @welcome
```

## Configuration

Environment variable access is enabled by default. Future versions will support configuration options to control this behavior through configuration files.

## Security Considerations

- Environment variables are treated as trusted user input
- All variables passed to mlld are accessible - be mindful of sensitive data
- Environment variables can be used in shell commands - standard shell injection precautions apply

## @INPUT in Pipelines

When using pipelines, an `@INPUT` variable is created in each step containing the previous command's output. This works alongside stdin passing for Unix compatibility.

### How It Works

```mlld
/exec @showInput() = [[
Received via @INPUT: {{INPUT}}
]]

/text @result = /run {echo "Hello, World!"} | @showInput
/add @result
```

Output:
```
Received via @INPUT: Hello, World!
```

### Smart Parameter Binding

When piping to functions without providing arguments, mlld intelligently handles the data:

**Single parameter functions** - @INPUT passed as the parameter:
```mlld
/exec @uppercase(text) = /run js {text.toUpperCase()}
/text @result = /run {echo "hello"} | @uppercase
>> uppercase receives: text = "hello"
```

**Multi-parameter functions with JSON** - Automatically destructured:
```mlld
/exec @greet(name, title) = [[Hello {{title}} {{name}}!]]
/text @result = /run {echo '{"name": "Smith", "title": "Dr."}'} | @greet
>> greet receives: name = "Smith", title = "Dr."
```

**Multi-parameter functions with non-JSON** - Passed as first parameter:
```mlld
/text @result = /run {echo "Alice"} | @greet
>> greet receives: name = "Alice", title = ""
```

### Pipeline Environment

Each pipeline step runs in a child environment where:
- @INPUT contains the piped data
- Parameters are bound from smart parameter handling
- Parent scope variables remain accessible
- Built-in transformers (@XML, @JSON, etc.) are available

## Best Practices

1. **Use descriptive variable names**: `API_KEY` vs `KEY`
2. **Validate critical variables**: Check for required environment variables
3. **Document dependencies**: List required environment variables in your scripts
4. **Use defaults when appropriate**: Provide fallback values for optional variables

```mlld
/import { NODE_ENV } from @input
/text @environment = @NODE_ENV || "development"
/text @message = [[Running in {{environment}} mode]]
/add @message
```