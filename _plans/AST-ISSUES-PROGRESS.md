# AST Issues Progress Report

## Original Issues
1. Path validation throwing errors on illegal characters (brackets)
2. Slashes not being allowed after variable references in import paths

## Investigation Path

### Attempt 1: Bracket Stripping in Validation
- Initial approach: Add bracket stripping in `_EmbedRHS` rule before validation
- Added code: `.replace(/^(\[|\]\])|(\]|\[\[)$/g, '')` to clean paths
- Result: No change in test failures (still 18 failures)
- Learning: The validation step wasn't even being reached

### Attempt 2: TextContent Rule Investigation
- Found critical issue in TextContent rule:
```pegjs
!("{{" / "}}" / "[" / "]" / "{" / "}" / BacktickSequence)
```
- This negative lookahead was explicitly rejecting brackets
- Modified to: `!("{" / "}" / BacktickSequence)`
- Result: Still getting `undefined` results but for a different reason
- Learning: Removing bracket restrictions wasn't enough

### Attempt 3: Adding Debug Statements
Added grammar expert's suggested changes:
```pegjs
// In ImportDirective
helpers.debug('ImportDirective', {rawPath, validatedPath});
if (!validatedPath) throw new Error('validatePath failed for ' + rawPath);

// In _EmbedRHS
helpers.debug('EmbedPath', {pathPart, validationResult});
if (!validationResult) throw new Error('validatePath failed for ' + pathPart);

// In RunDirective
const clean = content.filter(
  n => !(n.type === 'Text' && /^\s*$/.test(n.content))
);
```
- Result: Failures increased from 18 to 46
- New error: `Parse error: finalPathObject is not defined`
- Learning: We're now actually hitting the code paths we're trying to fix

## Key Findings

1. **Grammar Structure Issue**
   - The problem isn't just about validation
   - The grammar has multiple layers of restrictions on brackets:
     - TextContent rule blocking brackets
     - Validation step throwing on brackets
     - Possible issues with path part parsing

2. **Test Failure Evolution**
   - Initial 18 failures: Grammar completely rejecting bracketed content
   - Current 46 failures: Grammar accepting content but failing during processing
   - New error suggests we're now hitting the actual path processing code

3. **Parsing vs Validation**
   - Original theory: Validation was the primary issue
   - Current understanding: The grammar's parsing rules are too restrictive
   - Need to handle bracketed content at parse time before validation

## Next Steps

1. **Fix TextPart Rule**
   - Current rule is too restrictive on brackets
   - Need to allow brackets while still preventing directive/comment confusion

2. **Review Path Part Handling**
   - Look at how path parts are constructed
   - Ensure slashes after variables are properly handled

3. **Validation Layer**
   - Only after fixing parsing should we look at validation
   - May need to adjust what characters are considered "illegal"

## Thoughts

Looking at the latest test output and the TextPart rule, I think we're at a critical insight: The TextPart rule is the foundation for all text content in the grammar, and our changes to it (removing bracket restrictions) are now allowing content through that the rest of the grammar isn't prepared to handle.

## Open Questions

1. Why is `finalPathObject` undefined after our changes?
2. Are we properly handling the AST node structure for paths with variables?
3. Should brackets be stripped before or after validation?
4. How should we handle slashes in different contexts (after variables vs. in plain text)?