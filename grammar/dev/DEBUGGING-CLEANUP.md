# Meld Grammar Debugging Cleanup

This document outlines the plan for standardizing, cleaning up, and improving debugging approaches in the Meld grammar codebase.

## 1. Current State Assessment

The Meld grammar currently uses various debugging approaches:

1. **Explicit debug statements** using `helpers.debug()` scattered throughout the code
2. **The debug.md guide** providing guidance on debugging techniques
3. **Debug scripts** like `scripts/ast-output.js` for testing parser output
4. **Various ad-hoc approaches** for specific issues

Issues with the current approach:

1. **Inconsistent debug formatting** - different patterns and conventions
2. **Varying levels of detail** - some debug statements are detailed, others minimal
3. **Mixing of concerns** - some debug statements mix logical checks with debugging
4. **Left-in debugging** - temporary debugging statements remain in code
5. **Verbose output** - all debug statements produce output at the same level

## 2. Debugging Standards

### Debug Helper Functions

Implement standardized debug helper functions in the helpers module:

```javascript
// Standard debug with rule name and context
helpers.debugMatch(ruleName, context)

// Simple success/failure debug for predicates
helpers.debugPredicate(ruleName, condition, reason)

// Specialized variable debugging
helpers.debugVariable(ruleName, varName, value)

// Error or warning level debug
helpers.debugError(ruleName, errorInfo)
helpers.debugWarning(ruleName, warningInfo)
```

### Debug Statement Format

All debug statements should follow this standard format:

```javascript
helpers.debug('[ComponentName] RuleName: Action', {
  // Clean, organized debug object
  contextVar1,
  contextVar2,
  rawValue: '...',
  processingDetails: {
    // Nested structure when helpful
    step1: '...',
    step2: '...'
  }
});
```

### Debug Levels

Implement debug levels to control verbosity:

```javascript
// Different levels of verbosity
helpers.debug.trace('RuleName: Fine-grained details', {}); // Most verbose
helpers.debug.info('RuleName: Standard rule matching', {});
helpers.debug.warn('RuleName: Potential issues', {});
helpers.debug.error('RuleName: Actual failures', {});
```

### Debug Namespaces

Implement namespaces to categorize and filter debug output:

```javascript
// Namespace examples
helpers.debug('directive:text', 'Matched template variant', {});
helpers.debug('pattern:variable', 'Processing variable reference', {});
helpers.debug('core:parser', 'Starting parse process', {});
```

## 3. Cleanup Process

### Phase 1: Audit Existing Debug Statements

1. Create an inventory of all debug statements in the codebase
2. Categorize them by purpose, component, and importance
3. Identify patterns and inconsistencies
4. Create a prioritized list for cleanup

### Phase 2: Remove Obsolete Debug Statements

Criteria for removal:
- Commented-out debug code
- Debug statements with cryptic labels or minimal context
- Duplicate debug statements providing the same information
- Extremely verbose statements that dump entire objects
- Debug statements focused on implementation details rather than grammar

### Phase 3: Standardize Remaining Debug Statements

For each remaining debug statement:
1. Add component/rule name prefix
2. Standardize action descriptions
3. Clean up debug objects for readability
4. Apply consistent formatting
5. Categorize by debug level where appropriate

### Phase 4: Implement Debug Infrastructure Improvements

1. Add debug levels to control verbosity
2. Implement namespaces for filtering
3. Create helper functions for common debug patterns
4. Add timestamp and sequence information

## 4. Debug Placement Guidelines

### Appropriate Debug Locations

Debug statements should be placed at key points:

1. **Rule Entry Points** (for complex rules only)
   ```peggy
   MyComplexRule
     = &{ helpers.debugPredicate('MyComplexRule', true, 'Entry point'); return true; }
       // Rule content...
   ```

2. **After Successful Matches**
   ```peggy
   MyRule
     = pattern {
         helpers.debug('MyRule: Matched successfully', { /* context */ });
         return result;
       }
   ```

3. **Alternative Selection Points**
   ```peggy
   MyChoice
     = first {
         helpers.debug('MyChoice: Selected first alternative', { /* context */ });
         return result;
       }
     / second {
         helpers.debug('MyChoice: Selected second alternative', { /* context */ });
         return result;
       }
   ```

4. **Processing Steps** (for complex transformations)
   ```peggy
   ComplexTransformation
     = pattern {
         // Step 1: Extract data
         const extracted = /* ... */;
         helpers.debug('ComplexTransformation: Extracted data', { extracted });
         
         // Step 2: Transform
         const transformed = /* ... */;
         helpers.debug('ComplexTransformation: Transformed data', { transformed });
         
         // Return result
         return transformed;
       }
   ```

### Debug Statements to Avoid

1. **Debug in Basic Rules**
   Avoid debug statements in frequently used basic rules like whitespace, literals, or tokens.

2. **Debug Outside Action Blocks**
   Debug statements should be inside action blocks `{...}` to avoid parser errors.

3. **Excessive Entry/Exit Debugging**
   Don't add debug for both entry and exit of every rule - choose key points.

## 5. Implementation Examples

### Before (Current Debug Style):

```peggy
// Current inconsistent debug examples
DoubleBracketContent
  = '[[' parts:(InterpolationVar / TemplateTextSegment)* ']]' {
      helpers.debug('DoubleBracketContent matched [[...]]', { 
        parts: parts,
        isArray: Array.isArray(parts),
        length: Array.isArray(parts) ? parts.length : 'not array',
        firstType: Array.isArray(parts) && parts.length > 0 ? parts[0].type : 'none'
      });
      
      return parts;
    }
  / parts:InterpolationVar {
      helpers.debug('DoubleBracketContent matched {{var}}', { 
        parts: parts,
        type: parts ? parts.type : 'unknown'
      });
      
      return [parts];
    }
```

### After (Standardized Debug Style):

```peggy
// Standardized debug style
DoubleBracketContent "Content with {{var}} interpolation"
  = '[[' parts:(InterpolationVar / TemplateTextSegment)* ']]' {
      helpers.debug('pattern:template', 'DoubleBracketContent: Matched bracketed content', { 
        partCount: Array.isArray(parts) ? parts.length : 0,
        hasVariables: Array.isArray(parts) && parts.some(p => p.type === NodeType.VariableReference)
      });
      
      return parts;
    }
  / parts:InterpolationVar {
      helpers.debug('pattern:template', 'DoubleBracketContent: Matched direct variable', { 
        variableType: parts ? parts.type : 'unknown',
        identifier: parts?.identifier
      });
      
      return [parts];
    }
```

## 6. Debug Tools and Utilities

### Current Tools

1. **ast-output.js** - Direct parser testing script
2. **Debug options in npm scripts** - `npm run ast:debug`
3. **In-grammar debug via helpers.debug** - Direct debug statements

### Recommended Improvements

1. **Create a DEBUG.md Reference**
   - Document all debug commands and options
   - Include examples of common debugging scenarios
   - Add troubleshooting guide for common issues

2. **Enhance Debug Script**
   - Add option to filter by namespace or component
   - Add option to set debug level
   - Add structured output formats (JSON, formatted)
   - Add ability to visualize AST structure

3. **Implement Debug Console**
   - Create a simple web UI for interactive debugging
   - Show parse tree and AST side by side
   - Allow toggling debug levels and namespaces
   - Provide step-by-step visualization

## 7. Implementation Plan

### Phase 1: Define Standards and Create Tools
1. Finalize debug statement standards
2. Implement helper functions for standardized debugging
3. Create debug level infrastructure
4. Update DEBUG.md with new standards

### Phase 2: Audit and Clean Core Components
1. Audit debug statements in base components
2. Remove unnecessary debug statements
3. Standardize remaining debug statements
4. Add strategic debug points where missing

### Phase 3: Audit and Clean Directive Components
1. Audit debug statements in directive components
2. Apply same cleanup and standardization process
3. Ensure coverage of key parse points

### Phase 4: Enhance Debug Tools
1. Update ast-output.js with new debug features
2. Implement debug filtering and levels in build scripts
3. Create helper scripts for common debug scenarios

### Phase 5: Documentation and Reference
1. Document debugging best practices
2. Create examples of effective debugging
3. Add debugging section to contributing guidelines

## 8. Debug Comment Review Checklist

When reviewing debug statements, verify:

- [ ] Debug statements follow standard format
- [ ] Debug provides meaningful context information
- [ ] Debug objects are clean and informative
- [ ] Debug statements are placed at appropriate points
- [ ] No excessive or redundant debug statements
- [ ] Debug statements categorized by level where appropriate
- [ ] Debug statements use proper namespaces

## 9. Best Practices Samples

This section provides concrete examples of effective debug statements for different grammar components.

### Base Component Debug

```peggy
// Token-level debug - use sparingly
BaseIdentifier "Identifier"
  = first:[a-zA-Z_] rest:[a-zA-Z0-9_]* {
      const id = first + rest.join('');
      helpers.debug.trace('base:tokens', 'BaseIdentifier: Matched', { id });
      return id;
    }
```

### Pattern Component Debug

```peggy
// Pattern-level debug - focus on structure
BracketContent "Content with @var interpolation"
  = '[' parts:(BracketVar / CommandTextSegment / PathSeparator)* ']' {
      helpers.debug('pattern:content', 'BracketContent: Matched bracketed content', {
        partCount: parts.length,
        hasVariables: parts.some(p => p.type === NodeType.VariableReference),
        types: parts.map(p => p.type).filter((v, i, a) => a.indexOf(v) === i) // Unique types
      });
      return parts;
    }
```

### Directive Component Debug

```peggy
// Directive-level debug - focus on structure and metadata
AtRun "Run directive"
  = DirectiveContext "@run" _ runCode:RunLanguageCodeCore {
      helpers.debug('directive:run', 'AtRun: Matched language code block', {
        language: runCode.meta.language,
        hasArgs: runCode.values.args?.length > 0,
        isMultiLine: runCode.meta.isMultiLine
      });
      
      return helpers.createStructuredDirective(
        'run',
        'runCode',
        runCode.values,
        runCode.raw,
        runCode.meta,
        runCode.location,
        'code'
      );
    }
```

## 10. References and Resources

- Peggy documentation: `/grammar/dev/peggy.html`
- DEBUG.md: `/grammar/dev/DEBUG.md`
- Debug script: `/scripts/ast-output.js`
- Test utilities: `/grammar/tests/utils/test-helpers.ts`