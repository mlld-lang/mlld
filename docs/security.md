# Security Considerations

This document outlines security considerations when using mlld, particularly when processing untrusted data or LLM outputs.

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

/var @result = /run {generate-content} | @validateOutput("API keys")
/when @result contains "DENY" => /run {echo "Blocked potentially sensitive output"}
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