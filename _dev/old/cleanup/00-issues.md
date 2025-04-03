
I'll gather the information you requested by first looking at the GitHub issues and the provided clarity documents.

```bash
gh issue view 15 --repo adamavenir/meld
```

```bash
gh issue view 15 --repo adamavenir/meld --comments
```

```bash
gh issue view 14 --repo adamavenir/meld
```
Now that I've gathered information from the issues and the documentation, I can provide a more comprehensive analysis of the architectural challenges.

## On "Dual Architecture" Beyond Variable Resolution

In addition to the variable resolution dual architecture (which is being addressed in 01-RESOLUTION.md), there are other examples of dual architectures in the codebase:

1. **Directive Subtype Handling**: 
   - The current architecture handles different directive subtypes (like EmbedPathDirective, EmbedVariableDirective, EmbedTemplateDirective) through complex conditional logic rather than dedicated handlers
   - This creates an implicit "dual architecture" where directive behavior depends on runtime detection of subtypes rather than being explicitly modeled

2. **AST Structure vs Processing Logic**:
   - The AST structure (grammar parsing) and processing logic don't align
   - Processing code has to perform additional type detection that should ideally be handled at parse time

3. **Directive Execution vs Transformation**:
   - The codebase has two modes of operation: execution and transformation
   - These two paths aren't cleanly separated, leading to inconsistent behavior

## On "Context Object Inconsistency"

The issues with ResolutionContext are deeper than just undocumented fields:

1. **Ad-hoc Context Extensions**: 
   - OutputService adds `isInVariableContext` and `isInEmbedDirective` flags that aren't part of the official interface
   - These fields aren't recognized by other services but affect behavior

2. **Inconsistent Context Creation Patterns**:
   - Some code uses ResolutionContextFactory (good)
   - OutputService manually constructs contexts with additional fields (problematic)
   - These two approaches diverge over time, leading to inconsistent behavior

3. **Missing Context Validation**:
   - No validation ensures contexts have required fields
   - Code assumes certain fields exist without checking

4. **Conflicting Context Properties**:
   - Sometimes the same operation is performed with different context configurations
   - This makes behavior unpredictable depending on which code path is taken

## On "Growing Complexity and Workarounds"

The specific issues beyond what's being addressed in the issues you pointed to:

1. **Command Handler Complexity**:
   - As seen in RUN-CLARITY.md, run commands have three distinct patterns but aren't cleanly separated in the code

2. **Special Case Handling**:
   - Embed directives especially have accumulated special case handling
   - Instead of a clean architecture with explicit subtypes, there's conditional logic throughout the codebase

3. **Path Prefixing Workarounds**: 
   - Path prefixing prevention requires multiple flags (`disablePathPrefixing`, `preventPathPrefixing`, setting `path: false`)
   - These workarounds suggest the underlying design doesn't cleanly handle the use cases

4. **Error Recovery Workarounds**:
   - Error handling is inconsistent, with some code swallowing errors, others rethrowing them
   - This leads to unpredictable behavior when errors occur

## Assessment of Root Causes

The core issues appear to be:

1. **Semantic Gap Between AST and Processing**:
   - The AST doesn't capture the semantic distinctions needed for processing
   - This forces processing code to re-detect types and add context flags

2. **Missing Explicit Modeling of Subtypes**:
   - The codebase doesn't explicitly model the different directive subtypes
   - This creates a gap between the conceptual model (three embed types) and the implementation

3. **Inconsistent Application of Design Patterns**:
   - Factory patterns are used in some places but bypassed in others
   - This creates divergent code paths for similar operations

Issue #14 and #15 correctly identify that clearer directive structure in the AST would help, but the fixes proposed in 01-RESOLUTION.md address only one symptom rather than the underlying architectural issues.
