# mlld Stacktrace - User Experience

## Overview
When mlld encounters an error, users will see clear, actionable error messages that show what their script was doing and what data caused the issue.

## Basic Error Display

### Before (Current)
```
Unexpected Error: Cannot access field "questions" on non-object value
Error: Cannot access field "questions" on non-object value
    at accessField (/Users/adam/dev/mlld/dist/cli.cjs:34442:15)
    at evaluateDataValue (/Users/adam/dev/mlld/dist/cli.cjs:34876:18)
    ... JavaScript stack trace continues ...
```

### After (With Stacktraces)
```
FieldAccessError: Cannot access field "questions" on object

📍 Location: test.mld:15:35
   13 | )]
   14 | 
→  15 | @add foreach @getQuestions(@reply.questions)
                                          ^^^^^^^^^

🔍 Data Context:
   Variable: @reply
   Type: object (2 fields)
   Value: {
     "above": [Array with 12 items],
     "below": [Array with 8 items]
   }
   Available fields: above, below

🔄 mlld Trace:
   @data reply = run [(claude -p "@prompt")]    (line 9)
   └─ Received JSON object with fields: above, below
   @add foreach @getQuestions(@reply.questions)  (line 15)
   └─ ❌ Field "questions" not found

💡 Suggestion: The field "questions" doesn't exist on @reply.
   Did you mean: @reply.below
```

## Data Sampling Examples

### Large String Variables
```
🔍 Data Context:
   Variable: @llmOutput
   Type: string (45,892 chars)
   Sample: "Based on your request, here are the 50 states with nicknames:
           1. Alabama - ..." [first 200 chars shown]
```

### Arrays
```
🔍 Data Context:
   Variable: @items
   Type: array (1,250 items)
   Sample: [
     { id: 1, name: "First item", status: "active" },
     { id: 2, name: "Second item", status: "pending" },
     { id: 3, name: "Third item", status: "active" },
     ... and 1,247 more items
   ]
```

### Complex Objects
```
🔍 Data Context:
   Variable: @config
   Type: object (15 fields)
   Shape: {
     api: { url: "https://...", key: "[string]" },
     database: { host: "localhost", port: 5432 },
     features: { enabled: [Array(12)], flags: {...} },
     ... 12 more fields
   }
```

## Verbosity Levels

### Minimal (--stacktrace=minimal)
```
FieldAccessError: Cannot access field "questions" at test.mld:15:35
Available fields: above, below
```

### Standard (default)
Full display as shown in examples above.

### Verbose (--stacktrace=verbose)
```
[Standard display plus:]

🔍 Extended Data Context:
   Full @reply value (showing up to 50KB):
   {
     "above": [
       {
         "item": "Maine - Zany Maine",
         "comment": "Rhymes perfectly and captures the state's quirky character"
       },
       // ... all items shown ...
     ],
     "below": [
       // ... all items shown ...
     ]
   }

🔄 Detailed Execution:
   Frame 1: evaluate (Document) at test.mld:1
   Frame 2: evaluateDirective (@import) at test.mld:1
   Frame 3: evaluateDirective (@text) at test.mld:5
   // ... complete frame stack ...
```

## Special Scenarios

### Foreach Operations
```
🔄 mlld Trace:
   @data results = foreach @process(@items, @configs)  (line 8)
   └─ Processing iteration 42 of 300 (item #6 × config #7)
      └─ @exec process(item, config)
         └─ ❌ Error in processing
         
🔍 Current Iteration:
   item: { id: 6, name: "Product F", price: null }
   config: { tax_rate: 0.08, currency: "USD" }
```

### Import Errors
```
🔄 mlld Trace:
   In main.mld:
   @import { helper } from "./utils.mld"  (line 3)
   └─ In utils.mld:
      @text helper = @config.value      (line 12)
      └─ ❌ Variable "config" not defined
```

### Async Operations
```
🔄 mlld Trace:
   @data results = run [fetch-api.sh]  (line 10)
   └─ Command started at 14:23:05.123
   └─ Command failed after 2.5s
   └─ Exit code: 1
   └─ stderr: "Connection timeout"
```

## Configuration

### CLI Flags
```bash
# Disable stacktraces entirely
mlld --stacktrace=off script.mld

# Minimal output
mlld --stacktrace=minimal script.mld

# Verbose output
mlld --stacktrace=verbose script.mld
```

### Environment Variables
```bash
# Disable for production
MLLD_STACKTRACE=false mlld script.mld

# Set verbosity
MLLD_STACKTRACE_VERBOSITY=verbose mlld script.mld
```

## Benefits for Users

1. **Understand the data**: See exactly what values caused the error
2. **Trace execution**: Follow the path that led to the error
3. **Quick fixes**: Suggestions point to likely solutions
4. **No JS knowledge needed**: Everything shown in mlld terms
5. **Control output**: Choose detail level based on needs

## Performance Note

Stacktraces add minimal overhead during normal execution. When errors occur, mlld samples data intelligently:
- Strings: First 200 characters
- Arrays: First 5 items + count
- Objects: Structure + sampled values

This ensures error messages remain readable even with large datasets from LLM operations or file processing.