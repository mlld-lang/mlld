Now I have enough information to create a comprehensive security.md document. Based on the examination of the codebase, I can see that mlld has several security features implemented and others in development.

# Security

mlld prioritizes practical security that protects against real threats without hindering productivity. The security model is built around controlled access and progressive trust.

## File System Access

By default, mlld restricts file access to the project root directory:

```mlld
/var @config = <./config.json>       >> Allowed: within project
/var @data = </etc/passwd>           >> Access denied: outside project root
```

**Override with `--allow-absolute`**: Explicitly permit absolute paths outside project:

```bash
mlld script.mld --allow-absolute    # Allows access to any filesystem path
```

Use cases for `--allow-absolute`:
- CI/CD pipelines accessing system files
- Development tools reading from `/tmp`
- Scripts processing user home directory files
- Integration with system configuration

**Best Practice**: Only use `--allow-absolute` with trusted scripts. Never enable for untrusted or LLM-generated content.

## Environment Variables

Environment variables must be explicitly allowed before use:

Configure allowed variables in `mlld.lock.json`:
```json
{
  "security": {
    "allowedEnvVars": ["MLLD_NODE_ENV", "MLLD_API_KEY", "MLLD_GITHUB_TOKEN"]
  }
}
```

Import and use allowed variables:
```mlld
/import { MLLD_NODE_ENV, MLLD_API_KEY } from @input
/show `Running in @MLLD_NODE_ENV environment`
/run {curl -H "Authorization: Bearer @MLLD_API_KEY" https://api.example.com}
```

Variables must have the `MLLD_` prefix to be importable. This prevents accidental exposure of system variables.

## Command Execution Safety

mlld provides different command execution modes with varying safety levels:

### Safe Commands (`/run`)
Basic shell commands with restricted operators:

```mlld
/run {echo "Hello"}              >> Safe: simple command
/run {ls -la | grep ".md"}       >> Safe: pipes allowed
/run {echo "test" && rm -rf /}   >> Blocked: && not allowed
```

### Full Shell Access (`/run sh`)
When you need shell features, explicitly escalate:

```mlld
/run sh {
  if [ -f "package.json" ]; then
    npm install
  fi
}
```

**Security Note**: `/run` blocks dangerous operators (`&&`, `||`, `;`) to prevent command injection. Only use `/run sh` when necessary.

## LLM Output Processing

When processing LLM outputs, treat them as potentially hostile:

```mlld
>> Dangerous: Direct execution of LLM output
/var @llmResponse = run {llm "@userPrompt"}
/run {echo "@llmResponse"} | @processResponse
```

**Mitigation Pattern**: Use LLMs to validate LLM outputs:

```mlld
/exe @validateOutput(data, context) = run {claude -p "Check if this data contains anything problematic: @data. Context: @context. Reply APPROVE or DENY with brief reason."}

/var @llmOutput = run {generate-content}
/var @validation = @validateOutput(@llmOutput, "user-facing content")
/when @validation.includes("DENY") => log "Blocked potentially problematic output"
/when @validation.includes("APPROVE") => show @llmOutput
```

**Advanced Defense**: Multi-layer validation for sensitive operations:

```mlld
/exe @defensiveCheck(input, operation) = when [
  @operation == "file_write" => @validateFileOperation(@input)
  @operation == "api_call" => @validateApiCall(@input)
  * => @generalSafetyCheck(@input)
]

/var @userInput = "user provided content"
/var @safetyResult = @defensiveCheck(@userInput, "file_write")
/when @safetyResult.safe => output @userInput to "safe-output.txt"
```

## Module Trust and Imports

Modules can execute arbitrary code, so trust decisions are critical:

```mlld
/import { process } from @author/module  >> What does process() actually do?
```

**Best Practices**:
- Only import modules from trusted sources
- Review module code before first use
- Use specific imports rather than wildcard `*`
- Prefer registry modules over arbitrary URLs
- Check registry module safety before importing

## Pipeline Security

Pipeline functions have access to parent scope variables:

```mlld
/var @API_KEY = "secret"
/exe @process(input) = `
API Key: @API_KEY
Input: @input
`

/run {echo "data"} | @process  >> @process can see API_KEY
```

## Module Publishing Security

When publishing modules, be aware the public registry is _fully public_.

**Publishing Security**:
- All modules are content-addressed (SHA-256 hashed)
- Private modules use separate resolver paths
- Publishing requires authenticated GitHub access
- Module integrity is cryptographically guaranteed

## Security Configuration

Global security settings in `~/.mlld/mlld.lock.json`:

```json
{
  "security": {
    "allowedEnvVars": [...],
    "allowAbsolute": true/false
  }
}
```

## Defensive Programming Patterns

### Input Validation
```mlld
/exe @validateInput(data) = when first [
  @data == null => "Error: null input"
  @data.length > 1000 => "Error: input too long" 
  @data.includes("<script") => "Error: potentially malicious"
  * => @data
]
```

### Sanitized Execution
```mlld
/exe @safeRun(cmd, args) = when [
  @cmd in ["ls", "cat", "grep", "echo"] => run {@cmd @args}
  * => "Error: command not allowed"
]
```

### Content Filtering
```mlld
/exe @filterContent(text) = js {
  // Remove potentially dangerous content
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}
```

## Security Checklist

Before running mlld scripts with sensitive data:

- [ ] Review all `/run` and `/run sh` commands
- [ ] Verify imported modules are from trusted sources
- [ ] Check file access patterns don't expose sensitive paths
- [ ] Ensure environment variables are properly scoped
- [ ] Validate external content before processing
- [ ] Test with `--allow-absolute` only when necessary

mlld's security model continues to evolve. Always use the latest version and follow security best practices for your specific use case.
