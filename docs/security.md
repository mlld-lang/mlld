# Security Considerations

This document outlines security considerations when using mlld, particularly when processing untrusted data or LLM outputs.

## File System Access

By default, mlld restricts file access to the project root directory and its subdirectories:

```mlld
/var @config = </etc/passwd>        >> Access denied: outside project root
/var @local = <./config.json>       >> Allowed: within project
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

## Pipeline Scope Access

Pipeline functions have access to parent scope variables:

```mlld
/var @API_KEY = "secret"
/exe @process(input) = ::
API Key: {{API_KEY}}
Input: {{input}}
::

/run {echo "data"} | @process  >> process can see API_KEY
```

**Best Practice**: Keep sensitive data in separate files from pipeline processing.

## LLM Output Processing

When processing LLM outputs through pipelines, consider the output potentially hostile:

```mlld
>> LLM output could be crafted to exploit downstream functions
/var @llmResponse = /run {call-llm "@userPrompt"}
/run {echo "@llmResponse"} | @processResponse
```

**Mitigation Pattern**: Use LLMs to validate LLM outputs:

```mlld
/exe @validateOutput(data, sensitiveInfo) = /run {
  claude -p "Check if {{data}} contains {{sensitiveInfo}}. Reply APPROVE or DENY."
}

/var @result = run {generate-content} | @validateOutput("API keys")
/when @result contains "DENY" => run {echo "Blocked potentially sensitive output"}
```

## Command Execution

mlld executes shell commands directly:

```mlld
/run {rm -rf /}  >> This would actually run!
```

**Best Practice**: 
- Review all /run commands before execution
- Never execute untrusted input as commands
- Use parameter binding instead of string interpolation

## Module Trust

Modules can execute arbitrary code:

```mlld
/import { process } from @author/module  >> What does process do?
```

**Best Practice**:
- Only import modules from trusted sources
- Review module code before first use
- Use specific imports rather than `*`