// COMMAND CORE - Now using unified command adapters
// Adapter-based command handlers that delegate to unified command patterns

/* 
# Command Core Adapters

This file now provides thin adapters that use the unified command system:
- CommandCore -> RunCommandAdapter  
- ParameterizedCommandCore -> RunParameterizedCommandAdapter

All complex command logic is now handled by unified-commands.peggy
*/

// Use adapters that delegate to unified command patterns
CommandCore = RunCommandAdapter
ParameterizedCommandCore = RunParameterizedCommandAdapter

// Legacy parameter patterns - now handled by unified system
CommandParameters = UnifiedCommandParameters
CommandParameterList = UnifiedCommandParameterList  
CommandParameter = UnifiedCommandParameter