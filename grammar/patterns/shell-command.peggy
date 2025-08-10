// SHELL COMMAND - Now using unified command adapters
// Adapter-based shell command patterns that delegate to unified command system

/* 
# Shell Command Adapters

This file now provides adapters that use the unified command system:
- ShellCommandLine -> ShellCommandAdapter
- ShellCommand -> ShellCommandAdapter

All shell command logic is now handled by unified-commands.peggy
Security validation for banned operators is preserved.
*/

// Use adapters that delegate to unified command patterns
ShellCommandLine = ShellCommandAdapter
ShellCommand = ShellCommandAdapter

// SECURITY VALIDATION PATTERNS - Keep these for safety
// Chain operators (command separators) - BANNED for security
ChainOperator
  = op:("&&" / "||" / ";") {
      // These operators are banned in mlld for security reasons
      // Use separate @run commands or @when for control flow
      const opName = op === '&&' ? 'AND (&&)' : 
                     op === '||' ? 'OR (||)' : 
                     'semicolon (;)';
      helpers.mlldError(`Shell operator ${opName} is not allowed in mlld. Use separate @run commands or @when for control flow.`);
    }

// Redirection operators - BANNED for security
RedirectionOperator
  = op:(">>" / ">" / "<" / "&>") {
      // Redirection operators are banned in mlld for security reasons
      // Use @output directive for file writing
      const opName = op === '>>' ? 'append (>>)' : 
                     op === '>' ? 'redirect (>)' : 
                     op === '<' ? 'input (<)' :
                     'error redirect (&>)';
      helpers.mlldError(`Shell ${opName} operator is not allowed in mlld. Use @output directive for file operations.`);
    }

// Background operator - BANNED for security  
BackgroundOperator
  = "&" ![&>] {
      // Background execution is banned in mlld
      helpers.mlldError(`Background execution (&) is not allowed in mlld. All commands run synchronously.`);
    }