# @run Directive: Understanding and Implementation

## Core Concepts

The `@run` directive in Meld has three distinct syntaxes which serve different purposes:

1. **BasicCommand**: 
   - Simple syntax: `@run [command with {{variable}} interpolation]`
   - Multiline syntax: `@run [[...multiline command with {{variable}} and $path interpolation...]]`
   - Executes shell commands (single or multiline)
   - Supports variable interpolation with {{text/data variables}} and $path variables
   - For multiline format, first newline after `[[` is ignored for formatting purposes
   - Variables are resolved before command execution

2. **LanguageCommand**: `@run language (param1, param2) [[...multiline code in specified language...]]`
   - Executes code in a specific language (js, python, bash)
   - Parameters are passed to the script
   - Content within `[[...]]` is NOT interpolated - it's treated as raw code
   - Parameters support variable references

3. **DefinedCommand**: `@run $commandName({{param1}}, {{param2}})`
   - Executes a previously defined command (from @exec directive)
   - Parameters are passed by position to the command template
   - Parameters can be literal strings or variable references
   - Command templates may contain variable placeholders that are substituted

## Key Principles and Constraints

1. **Syntax Strictness**:
   - BasicCommand (simple form) must be enclosed in single brackets `[...]`
   - BasicCommand (multiline form) and LanguageCommand must use double brackets `[[...]]`
   - DefinedCommand uses function-call syntax `$name(...)`

2. **Interpolation Rules**:
   - BasicCommand: Variables are interpolated before execution (in both simple and multiline forms)
   - LanguageCommand: The code is NOT interpolated, only the parameters are resolved
   - DefinedCommand: Parameters are resolved and then substituted into the command template

3. **Language Handling**:
   - JavaScript (js): Creates a temporary .js file executed with Node.js
   - Python (py): Creates a temporary .py file executed with the Python interpreter
   - Bash (default): Creates a temporary .sh file executed with bash

4. **Parameter Passing**:
   - LanguageCommand: Parameters are passed as command-line arguments to the script
   - DefinedCommand: Parameters are mapped by position to placeholders in the command template

## Current Implementation Challenges

1. **Subtype classification**: Current code doesn't clearly distinguish between run directive types early in the pipeline

2. **Command reference handling**: Legacy and AST-based command reference implementations coexist

3. **Parameter resolution**: Multiple approaches to parameter extraction and substitution

4. **Execution context**: Different run types have different execution contexts and error handling needs

## Implementation Plan

### Step 1: Clear Classification

Ensure each run directive is properly classified at parse time, leveraging the classification already done by the parser:

```typescript
private determineRunType(node: DirectiveNode): 'basicCommand' | 'languageCommand' | 'definedCommand' {
  const { directive } = node;
  
  // Check for command reference (AST-based or legacy)
  if (directive.isReference || 
      (directive.command && typeof directive.command === 'object' && directive.command.name) ||
      (typeof directive.command === 'string' && directive.command.startsWith('$'))) {
    return 'definedCommand';
  }
  
  // Check for multi-line with language
  if (directive.isMultiLine && directive.language) {
    return 'languageCommand';
  }
  
  // Both simple commands and multiline commands without a language
  // can use the same handler as they differ only in execution method
  return 'basicCommand';
}
```

### Step 2: Specialized Handlers

Create dedicated handlers for each run directive type:

```typescript
private async handleBasicCommand(node, context) {
  // Handle both simple and multiline commands with variable interpolation
  const { directive } = node;
  const command = await this.resolutionService.resolveInContext(directive.command, context);
  
  // For multiline, we need a temporary script
  if (directive.isMultiLine) {
    const tempScriptPath = `/tmp/meld-script-${Date.now()}.sh`;
    await this.fileSystemService.writeFile(tempScriptPath, `#!/bin/bash\n${command}`);
    await this.fileSystemService.executeCommand(`chmod +x ${tempScriptPath}`);
    return this.executeCommand(tempScriptPath, context);
  }
  
  // For single line, execute directly
  return this.executeCommand(command, context);
}

private async handleLanguageCommand(node, context) {
  // Handle language-specific command
  const { language, command, parameters } = node.directive;
  const tempScript = await this.createTempScript(language, command);
  const resolvedParams = await this.resolveParameters(parameters, context);
  return this.executeCommand(`${tempScript} ${resolvedParams.join(' ')}`, context);
}

private async handleDefinedCommand(node, context) {
  // Handle defined command reference with parameter substitution
  const commandName = this.getCommandName(node.directive);
  const commandDef = context.state.getCommand(commandName);
  const args = await this.resolveCommandArgs(node.directive, context);
  const command = this.substituteParameters(commandDef.command, commandDef.parameters, args);
  return this.executeCommand(command, context);
}
```

### Step 3: Consistent Parameter Handling

Standardize parameter resolution across command types:

```typescript
private async resolveParameters(parameters, context) {
  const resolvedParams = [];
  
  for (const param of parameters) {
    if (param.type === 'VariableReference') {
      const resolvedValue = await this.resolutionService.resolveVariable(param, context);
      resolvedParams.push(this.quoteForShell(resolvedValue));
    } else if (typeof param === 'string') {
      resolvedParams.push(this.quoteForShell(param));
    }
  }
  
  return resolvedParams;
}
```

### Step 4: Unified Output Transformation

Ensure consistent output handling for all command types:

```typescript
private createOutputNode(output, node, context) {
  // Create a replacement node with output content
  const formattingMetadata = {
    isFromDirective: true,
    originalNodeType: node.type,
    preserveFormatting: true,
    isOutputLiteral: true,
    transformationMode: context.state.isTransformationEnabled()
  };
  
  return {
    type: 'Text',
    content: output,
    location: node.location,
    formattingMetadata
  };
}
```

## Testing Strategy

1. **Unit Tests**:
   - Test subtype classification with different run directive formats
   - Test parameter resolution for each command type
   - Test variable interpolation in simple and multiline commands
   - Test command execution for each type

2. **Integration Tests**:
   - Test complete pipeline processing for each run type
   - Test interaction with state service for variable resolution
   - Test transformation of run directives to output content

3. **Specific Test Cases**:
   - Test command arguments with spaces and special characters
   - Test multiline commands with complex shell syntax
   - Test language commands with different parameter patterns
   - Test defined commands with complex templates

## Validation Criteria

Implementation is considered successful when:
- All run types are correctly classified and handled
- Parameters are properly resolved and passed to commands
- Variables are correctly interpolated in commands
- Command output is properly captured and formatted
- All tests pass without special handling or workarounds
- AST and legacy command reference handling is unified
- Error messages are clear and helpful