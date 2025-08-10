// COMMAND BASE - Now using unified command adapters  
// Adapter-based command base patterns that delegate to unified command system

/* 
# Command Base Adapters

This file now provides adapters that use the unified command system:
- CommandWithBases -> ShellCommandAdapter
- CommandBase -> ShellCommandAdapter

All command base detection logic is now handled by unified-commands.peggy
*/

// Use adapters that delegate to unified command patterns
CommandWithBases = ShellCommandAdapter
CommandBase = ShellCommandAdapter

// Legacy compatibility adapters
QuotedCommand = ShellCommandAdapter  
BracketedCommand = ShellCommandAdapter
BraceCommand = ShellCommandAdapter