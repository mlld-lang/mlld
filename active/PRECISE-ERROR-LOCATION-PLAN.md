# Precise Error Location Implementation Plan

## Overview
Implement precise column-level error locations by capturing individual token positions in error recovery rules.

## Current State
- Error recovery rules use `location()` which gives the position of the entire rule match
- All errors point to column 1 (start of directive)
- We have the infrastructure (mlldLocation) but not the precise data

## Implementation Steps

### Step 1: Create Token Capture Helpers (30 mins)
Modify grammar rules to capture token positions:

```peggy
// Before:
/ DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ &(LineTerminator / EOF) {
    helpers.mlldError("Missing value...", "value", location());
  }

// After:
/ DirectiveContext varStart:"/var" _ atSign:"@" id:BaseIdentifier _ equals:"=" _ &(LineTerminator / EOF) {
    // Calculate position after the = sign
    const errorLoc = helpers.calculateLocationAfter(equals, location());
    helpers.mlldError("Missing value...", "value", errorLoc);
  }
```

### Step 2: Add Location Calculation Helper (1 hour)
In `grammar-core.js`, add helper to calculate precise positions:

```javascript
calculateLocationAfter(token, fullLocation) {
  // If token is a string, calculate based on its length
  if (typeof token === 'string') {
    const tokenLength = token.length;
    // Use fullLocation to determine the position after the token
    // This requires parsing the input to find where the token appears
  }
  // Return a proper location object with start/end
}
```

### Step 3: Update All Error Recovery Rules (2-3 hours)
Systematically update each error recovery rule to:
1. Capture relevant tokens
2. Calculate precise error position
3. Pass calculated location to mlldError

Priority rules to update:
- `/var` - point to position after `=` for missing value
- `/when` - point to position after condition for missing `=>`
- `/import` - point to position after `from` for missing path
- `/output` - point to position after `to` for missing target
- `/run` - point to position after language for missing code block

### Step 4: Enhance mlldLocation Data (1 hour)
Modify `mlldError` to include span information:

```javascript
mlldError(message, expectedToken, loc, span) {
  const error = new Error(message);
  error.isMlldError = true;
  error.expectedToken = expectedToken;
  error.mlldErrorLocation = {
    ...loc,
    length: span || 1  // Default to 1 if no span provided
  };
  throw error;
}
```

### Step 5: Test & Refine (1 hour)
Create comprehensive test cases to verify:
- Errors point to the correct column
- Multi-character tokens are properly underlined
- Edge cases (end of line, end of file) work correctly

## Challenges

### 1. Token Position Tracking
Peggy doesn't directly expose token positions in string literals. We need to either:
- Create wrapper rules for each token (e.g., `EqualSign = "=" { return {token: "=", loc: location()}; }`)
- Or calculate positions based on the full match location and token positions

### 2. Whitespace Handling
Need to accurately account for whitespace between tokens to calculate correct positions.

### 3. Performance Impact
Capturing every token position could impact parser performance. Need to balance precision with speed.

## Alternative Approach: Post-Parse Enhancement

Instead of modifying grammar rules, we could:
1. Let errors happen naturally
2. Use the error message to identify the issue
3. Re-parse the specific line to find exact token positions
4. Enhance the error with precise location

This would be less invasive but might miss some edge cases.

## Estimated Total Time: 5-6 hours

## Expected Outcome
Errors that point to the exact position of the problem:
```
  ./error.mld:2:14
  1 | # Example
  2 | /var @name = 
               ^
  3 | /show @name

  ./error.mld:5:17
  4 | # Missing =>
  5 | /when @condition
                   ^^
  6 | /show "done"
```