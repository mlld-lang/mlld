# JSON Import Debugger

This is a specialized debugging utility that demonstrates custom import handlers for JSON files with Meld.

## Key Features

1. **Custom JSON Import Handler**:
   - Allows importing specific properties from JSON files
   - Demonstrates selective property importing
   - Shows error handling for JSON parsing

2. **Manual Service Registration**:
   - Provides a lightweight way to initialize services without the full DI container
   - Useful for isolated testing of specific components

3. **State Event Monitoring**:
   - Simple implementation of the StateEventService for tracking state changes
   - Helps debug variable resolution and state transitions

## Usage

```
node scripts/json-import-debug/json-import-debugger.js debug-transform <file>
```

Where `<file>` is a Meld file that imports JSON content.

## Use Cases

- Testing custom import handlers
- Debugging JSON data variable resolution
- Isolating state tracking for import operations
- Reference implementation for specialized directive handlers

This utility was preserved from development debugging tools as a reference implementation for custom import handlers.