# Precise Error Locations in mlld - Analysis and Recommendation

**Recommendation: DO NOT IMPLEMENT at this time**

While technically feasible, implementing precise column-level error locations would add significant complexity to the mlld grammar for marginal benefit. The current approach of showing the problematic line with descriptive error messages is sufficient for mlld's use case as an embedded scripting language with primarily single-line directives.

## Executive Summary

After extensive investigation, we've determined that:
1. Peggy CAN capture precise token positions through dedicated token rules
2. Implementation would require 6-8 hours of systematic grammar updates
3. The complexity cost outweighs the benefits for mlld's typical usage patterns
4. Current error messages with line display provide adequate debugging information

## Technical Findings

### Current State
- All parse errors report column 1 (start of directive)
- Error messages are descriptive and context-specific thanks to error recovery rules
- Source line is displayed to help users identify the issue
- The system works well for mlld's single-line directive model

### Proof of Concept
We successfully demonstrated precise token position capture:

```peggy
// Token rules capture exact positions
VarToken = "/var" { 
  return { text: "/var", location: location() }; 
}

EqualToken = "=" { 
  return { text: "=", location: location() }; 
}

// Error recovery uses token positions
/ varToken:VarToken ws atToken:AtToken id:Identifier ws eqToken:EqualToken ws &EOF {
    const errorColumn = eqToken.location.end.column + 1;
    // Create error pointing to exact position after '='
}
```

Test results showed accurate column tracking:
- `/var @test =` → Error at column 13 (after '=')
- `/var   @test   =` → Error at column 17 (after '=')

## Implementation Requirements

### 1. Create Token Capture Rules (2-3 hours)
Would need ~100+ token rules for:
- Directive keywords: `/var`, `/when`, `/run`, `/import`, `/output`, `/show`, `/exe`
- Operators: `=`, `=>`, `from`, `to`, `as`, `with`
- Delimiters: `@`, `{`, `}`, `[`, `]`, `(`, `)`, `:`, `;`
- Keywords: `run`, `foreach`, `first`, `any`, `all`
- Special markers: `#`, `::`, `--`, `//`

### 2. Update Grammar Structure (1-2 hours)
- Replace string literals with token rule references throughout
- Ensure consistent token naming conventions
- Update all composite rules to use token rules

### 3. Modify Error Recovery Rules (3-4 hours)
For each of the 50+ error recovery rules:
- Update to capture token positions
- Calculate precise error location
- Pass enhanced location data

Example transformation:
```peggy
// Before
/ DirectiveContext "/var" _ "@" id:BaseIdentifier _ "=" _ &(LineTerminator / EOF) {
    helpers.mlldError("Missing value...", "value", location());
  }

// After  
/ DirectiveContext varToken:VarToken _ atToken:AtToken id:BaseIdentifier _ eqToken:EqualToken _ &(LineTerminator / EOF) {
    const errorLoc = {
      line: eqToken.location.end.line,
      column: eqToken.location.end.column + 1,
      length: 1
    };
    helpers.mlldError("Missing value...", "value", errorLoc);
  }
```

### 4. Testing and Refinement (1 hour)
- Verify all error positions are accurate
- Test edge cases (end of line, end of file)
- Ensure no regression in error message quality

## Trade-off Analysis

### Current Approach
**Pros:**
- Simple, maintainable grammar
- Excellent performance (no token object overhead)
- Clear separation between syntax and error handling
- Easy to add new directives or modify syntax

**Cons:**
- All errors point to column 1
- Less precise for complex multi-token errors

### Precise Location Approach
**Pros:**
- Errors point to exact problem location
- Better IDE integration potential
- More professional error presentation

**Cons:**
- Grammar complexity increases ~3x
- Every token match creates an object (memory/performance impact)
- Higher maintenance burden
- Risk of token rule bugs affecting parsing
- Significant refactoring effort

## Why This Matters Less for mlld

1. **Single-line directives**: Most mlld directives are single-line, making line-level errors sufficient
2. **Clear error messages**: Our error recovery rules provide specific, actionable messages
3. **Not a general-purpose language**: mlld is embedded in Markdown, where precise column tracking is less critical
4. **Usage patterns**: Users typically write simple directives where the error location is obvious

## Alternative Improvements (Recommended)

Instead of precise locations, consider:
1. **Enhanced error messages**: Continue improving message clarity
2. **Better suggestions**: Add more "did you mean?" suggestions
3. **Syntax highlighting**: Help prevent errors before they occur
4. **Documentation**: Clear examples of correct syntax

## Conclusion

The investigation proved that precise error locations are technically feasible in Peggy through systematic token capture. However, the implementation would require substantial changes to the grammar architecture for limited practical benefit.

mlld's current approach of descriptive error messages with line display is well-suited to its design as a lightweight, embedded scripting language. The engineering effort required for precise locations would be better invested in other areas of the language.

## Appendix: Working Test Files

For future reference, these test files demonstrate the approach:
- `test-token-positions.peggy` - Token position capture proof of concept
- `test-error-positions.peggy` - Error recovery with precise locations
- `test-token-positions.js` - Test harness showing column extraction

These can be referenced if this decision is revisited in the future.