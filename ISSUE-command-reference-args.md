# AST Command Reference Parameter Handling Issue

## Problem Description

When using command references with the `@run` directive (e.g., `@run $commandName("arg1", "arg2")`), the AST structure does not properly capture the arguments passed to the command reference. This leads to issues with parameter substitution where quoted strings, commas within strings, and variable references aren't handled correctly.

### Current Behavior

1. When a command reference like `$commandName("arg1", "arg2")` is parsed:
   - The AST structure provides only `$commandName` as the command value
   - The arguments `("arg1", "arg2")` are not captured in the AST structure
   - No proper handling for quotes, commas, or variable references in arguments

2. This means the `RunDirectiveHandler` has to:
   - Use regex to extract the command name and arguments string
   - Do its own parsing of arguments (handling quotes, commas, etc.)
   - Manually substitute parameters into the command template

3. Example of failing cases:
   ```
   @define runthis(x, y) = @run [echo {{x}} {{y}}]
   
   // Produces: ("hello","world") instead of: hello world
   @run $runthis("hello","world")
   
   // Produces: (howdy, planet) instead of: howdy planet
   @text hello = "howdy"
   @text world = "planet"
   @run $runthis({{hello}}, {{world}})
   
   // Produces: ("hello, friend","beautiful world") instead of: hello, friend beautiful world 
   @run $runthis("hello, friend","beautiful world")
   ```

### Expected Behavior

1. The AST should parse command references fully:
   - Identify `$commandName` as a command reference
   - Properly capture and parse the arguments `("arg1", "arg2")`
   - Handle quoted strings, commas within quotes, and variable references properly

2. The parsed arguments should be available in the AST structure:
   ```javascript
   {
     type: 'Directive',
     directive: {
       kind: 'run',
       command: '$commandName',
       isReference: true,
       args: ['arg1', 'arg2']  // Arguments properly parsed
     }
   }
   ```

3. For variable references like `{{var}}`, these should be:
   - Recognized as variable references in the arguments
   - Properly resolved before parameter substitution

## Current Workarounds

We've implemented several workarounds in `RunDirectiveHandler.ts`:

1. Manual argument parsing:
   ```typescript
   const parseArgs = (argsString: string): string[] => {
     if (\!argsString || argsString.trim() === '') {
       return [];
     }
     
     const args: string[] = [];
     let currentArg = '';
     let inQuote = false;
     let quoteChar = '';
     
     for (let i = 0; i < argsString.length; i++) {
       const char = argsString[i];
       
       // Handle quotes
       if ((char === '"' || char === "'") && (i === 0 || argsString[i - 1] \!== '\\')) {
         if (\!inQuote) {
           inQuote = true;
           quoteChar = char;
           continue; // Skip the opening quote
         } else if (char === quoteChar) {
           inQuote = false;
           quoteChar = '';
           continue; // Skip the closing quote
         }
       }
       
       // If not in quotes and we hit a comma, push the arg and reset
       if (\!inQuote && char === ',') {
         args.push(currentArg.trim());
         currentArg = '';
         continue;
       }
       
       // Add the character to our current arg
       currentArg += char;
     }
     
     // Add the last arg if there is one
     if (currentArg.trim() \!== '') {
       args.push(currentArg.trim());
     }
     
     return args;
   };
   ```

2. Quote stripping for sanitizing arguments:
   ```typescript
   const sanitizeArg = (arg: string): string => {
     // Remove surrounding quotes if present
     if ((arg.startsWith('"') && arg.endsWith('"')) || 
         (arg.startsWith("'") && arg.endsWith("'"))) {
       return arg.substring(1, arg.length - 1);
     }
     return arg;
   };
   ```

3. Special handling for echo commands:
   ```typescript
   // Special handling for echo commands
   if (commandString.startsWith('echo ') && sanitizedArgs.length > 0) {
     // Strip any remaining quotes from arguments
     const strippedArgs = sanitizedArgs.map(arg => {
       if ((arg.startsWith('"') && arg.endsWith('"')) || 
           (arg.startsWith("'") && arg.endsWith("'"))) {
         return arg.substring(1, arg.length - 1);
       }
       return arg;
     });
     
     commandToExecute = `echo ${strippedArgs.join(' ')}`;
     directiveLogger.debug(`Built direct echo command: ${commandToExecute}`);
   }
   ```

## Edge Cases Not Fully Handled

Despite our workarounds, several edge cases remain problematic:

1. **Nested quotes**: Arguments with mixed quote types (e.g., `"He said 'hello'"`) may not be parsed correctly.

2. **Escaped quotes**: Arguments with escaped quotes (e.g., `"Hello \"World\""`) may not be handled properly.

3. **Nested variable references**: Complex nested variable references like `{{obj.{{dynamicProp}}}}` would be difficult to handle.

4. **Commands with complex shell syntax**: Commands with pipes, redirects, or shell syntax (e.g., `@run [grep "{{pattern}}" | sort]`) may not have parameters substituted correctly.

5. **Array indexing in variable references**: Arguments with array indexing like `{{array[0]}}` might not resolve correctly.

6. **Complex commands beyond echo**: Our special-case handling for echo commands doesn't extend to other commands with similar needs.

## Grammar Analysis

After examining the existing meld.pegjs grammar, the following observations can be made:

1. **Current Grammar Implementation**: 
   - The `RunDirective` rule (lines 528-561) handles two patterns: `@run [command]` and `@run {{variable}}`
   - For command references (starting with `$`), it simply sets `isReference: true` but doesn't parse the arguments
   - The `DirectiveContent` rule (lines 1051-1054) extracts the entire content inside brackets as a single string
   - No specific rules exist for parsing command references with arguments

2. **Root Cause in the Grammar**:
   - The grammar doesn't differentiate between a command reference like `$commandName` and a command reference with arguments like `$commandName("arg1", "arg2")`
   - The entire string `$commandName("arg1", "arg2")` is captured as the command value
   - There's no parsing of the arguments into an array or structure that can be used by the resolver

3. **Existing Parsing Capabilities**: 
   - The grammar already has robust rules for handling quoted strings (`QuotedString` rule)
   - It has rules for parsing variable references (`Variable` rule)
   - It handles complex nesting in other contexts, but these aren't leveraged for command references
   - The existing `BracketChar` and related rules could be extended for command argument parsing

## Proposed AST Changes

To properly fix this issue, the AST parser (in `meld.pegjs`) should be updated to:

1. Add a dedicated `CommandReference` rule to parse command references and their arguments:
   ```pegjs
   CommandReference
     = "$" name:Identifier args:CommandArgs? {
         return {
           name,
           args: args || [],
           isCommandReference: true
         };
       }
   
   CommandArgs
     = "(" _ args:CommandArgsList? _ ")" {
         return args || [];
       }
   
   CommandArgsList
     = first:CommandArg rest:(_ "," _ arg:CommandArg { return arg; })* {
         return [first, ...rest];
       }
   
   CommandArg
     = StringLiteral   // Handle quoted strings
     / Variable        // Handle variable references like {{var}}
     / RawArg          // Handle unquoted arguments
   
   RawArg
     = chars:RawArgChar+ {
         return chars.join('').trim();
       }
   
   RawArgChar
     = \!("," / ")") char:. { return char; }
   ```

2. Update the `RunDirective` rule to use this new `CommandReference` rule:
   ```pegjs
   RunDirective
     = "run" _ "[" cmdRef:CommandReference "]" header:UnderHeader? {
         return createDirective('run', {
           command: cmdRef.name,
           args: cmdRef.args,
           isReference: true,
           ...(header ? { underHeader: header } : {})
         }, location());
       }
     / "run" _ content:DirectiveContent header:UnderHeader? {
         validateRunContent(content);
         return createDirective('run', {
           command: content,
           ...(content.startsWith("$") ? { isReference: true } : {}),
           ...(header ? { underHeader: header } : {})
         }, location());
       }
     / "run" __ variable:Variable header:UnderHeader? {
         // [existing variable handling code]
       }
   ```

3. Ensure `CommandResolver` in `ResolutionService` properly uses the parsed arguments from the AST.

4. Update `RunDirectiveHandler` to use the parsed arguments from the AST structure rather than doing its own parsing.

5. Address implementation challenges:
   - Maintain backward compatibility with existing code
   - Update resolution services to use the parsed arguments
   - Carefully handle edge cases like nested quotes and escaped characters

## Immediate Next Steps

Until the AST is updated, we should:

1. Add more robust error handling for edge cases in our current workaround.

2. Add comprehensive tests covering all edge cases.

3. Consider adding a warning when complex command structures are detected, recommending users to simplify or use direct `@run` directives for those cases.

4. Document the limitations of command references in the current implementation.

## Long-term Fix

The proper long-term fix requires:

1. Updating the AST parser to properly handle command references and their arguments.

2. Ensuring the `CommandResolver` in `ResolutionService` uses the parsed arguments correctly.

3. Simplifying `RunDirectiveHandler` to rely on the AST structure rather than doing its own parsing.

4. Adding comprehensive tests for all edge cases to ensure they're properly handled.

This would provide a more robust solution that aligns with the existing architecture and ensures consistent behavior across all use cases.
