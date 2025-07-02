# Grammar Consolidation AST Audit Prompt

## Mission Brief

You are conducting a critical audit of the grammar consolidation changes to identify any **AST resolution or detail that may have been lost** during the pattern unification process. The consolidation successfully eliminated 21+ duplicate patterns (95% reduction) and improved maintainability, but we need to ensure we haven't sacrificed important AST richness or type precision.

## Context Documents (Sacred Text)

Please thoroughly review these three documents before starting your audit:

1. **CONSOLIDATE-GRAMMAR.md** - Complete record of all consolidation phases and changes made
2. **grammar/README.md** - Grammar principles, especially the "Critical: Grammar-Type Synchronization" section
3. **docs/dev/AST.md** - AST context guide and type interpretation rules

## Audit Scope

### What We're Looking For

**GOOD consolidation examples** (keep these):
- Eliminated duplicate `@identifier + fields` parsing logic
- Unified variable reference patterns across contexts
- Reduced maintenance burden without losing functionality

**POTENTIAL PROBLEMS** (investigate these):
- **Lost semantic granularity**: Where consolidated patterns produce less specific AST nodes
- **Reduced type precision**: Where unified patterns lose important type discrimination
- **Missing context information**: Where consolidation removed useful metadata or structure
- **Flattened hierarchies**: Where detailed parsing was replaced with generic parsing

### Specific Areas of Concern

1. **BaseIdentifier Removal**: 
   ```diff
   -  = "@" identifier:BaseIdentifier fields:AnyFieldAccess* args:OutputArguments? !("|" / "with" / "trust" / "needs") {
   -      const hasArgs = args && args.length > 0;
   -      const isTemplate = hasArgs; // With args, it's a template/command invocation
   +  = ref:UnifiedReferenceNoTail !("|" / "with" / "trust" / "needs") {
   +      // Handle both ExecInvocation and VariableReference types from unified patterns
   ```
   - Did BaseIdentifier provide useful semantic information?
   - Does the unified pattern preserve the same level of detail?

2. **Command vs Variable Distinction**: 
   - Are we still able to distinguish between `@var` and `@cmd()` at parse time?
   - Do we maintain the semantic difference between data references and executable invocations?

3. **Context-Specific Patterns**:
   - Did directive-specific patterns provide important context that unified patterns don't?
   - Are we losing metadata about usage context?

4. **Type Alignment**:
   - Do the consolidated patterns still produce AST that matches our TypeScript types in `core/types/`?
   - Are type guards still accurate for the new AST structure?

## Audit Method

### Phase 1: Document Analysis
1. **Map Consolidation Changes**: Review CONSOLIDATE-GRAMMAR.md phases 2-7 to understand exactly what was unified
2. **Identify Pattern Replacements**: Create a table of old pattern → new pattern mappings
3. **Type Comparison**: Compare old AST structures with new ones using `core/types/` as reference

### Phase 2: AST Output Comparison
1. **Generate Test Cases**: Create mlld examples that exercise the consolidated patterns
2. **Compare AST Output**: Use `npm run ast -- '<mlld syntax>'` to see actual output differences
3. **Type Validation**: Verify that new AST still satisfies our TypeScript interfaces

### Phase 3: Semantic Analysis
1. **Context Preservation**: Check if context information is still available in the new AST
2. **Metadata Completeness**: Verify that important semantic flags and metadata are preserved
3. **Downstream Impact**: Consider how interpreter and other AST consumers might be affected

## Specific Questions to Answer

### AST Structure Questions
1. **Granularity**: Are we still producing appropriately detailed AST nodes for each semantic concept?
2. **Discrimination**: Can we still distinguish between semantically different uses of the same syntax?
3. **Metadata**: Are important semantic flags and context information still being captured?
4. **Type Safety**: Do the new patterns still produce type-safe AST that matches our interfaces?

### Pattern-Specific Questions
1. **UnifiedReferenceWithTail vs UnifiedReferenceNoTail**: Do these capture all the nuances of the original patterns?
2. **VariableWithTail vs VariableNoTail**: Are we maintaining the same level of context awareness?
3. **Field Access Patterns**: Are complex field access patterns (like `@obj.method()`) still parsed with full detail?
4. **Command References**: Are command invocations still distinguishable from variable references?

### Type System Questions
1. **Interface Alignment**: Do consolidated patterns still produce AST that matches `core/types/` interfaces?
2. **Type Guards**: Are our type guard functions still accurate with the new AST structure?
3. **Context Detection**: Can we still use the patterns in `docs/dev/AST.md` to determine node context?

## Expected Deliverables

### 1. Consolidation Impact Report
- **Summary**: High-level assessment of AST changes
- **Preserved Features**: What semantic detail was successfully maintained
- **Lost Features**: What granularity or context was lost (if any)
- **Risk Assessment**: Impact on interpreter and other AST consumers

### 2. Detailed Findings
For each area where resolution was lost:
- **What was lost**: Specific AST detail or semantic information
- **Why it matters**: Impact on type safety, interpretation, or functionality  
- **Proposed fix**: How to add back the important detail without breaking consolidation
- **Implementation strategy**: Specific changes to make to unified patterns

### 3. Recommendations
- **Keep as-is**: Areas where consolidation was successful with no issues
- **Enhance patterns**: Specific improvements to unified patterns to restore lost detail
- **Add metadata**: Places where additional metadata flags could restore semantic information
- **Type updates**: Any needed updates to `core/types/` to match new AST structure

## Success Criteria

A successful audit will:
1. **Identify all lost semantic information** (if any) from the consolidation
2. **Provide specific, actionable recommendations** for restoring important detail
3. **Maintain the consolidation benefits** while addressing any deficiencies
4. **Ensure type system alignment** between grammar and TypeScript interfaces
5. **Preserve the "abstraction-first design" principle** while adding back necessary granularity

## Anti-Patterns to Avoid

Don't recommend:
- **Reverting consolidation**: The pattern unification was successful and should be preserved
- **Adding complexity for complexity's sake**: Only restore detail that has clear semantic value
- **Breaking abstraction-first design**: Solutions should enhance unified patterns, not bypass them
- **Point solutions**: Address issues at the pattern level, not in individual directives

## Context Reminder

The consolidation was architecturally sound and eliminated significant duplicate code. We're looking for **surgical improvements** to the unified patterns, not wholesale changes. The goal is to have our cake and eat it too: maintain the clean, DRY architecture while ensuring we haven't lost important semantic granularity.

Your audit should be thorough but focused on actionable findings that will make the grammar both maintainable AND semantically rich.