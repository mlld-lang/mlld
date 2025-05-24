
# {{directive.name}} Type Requirements Analysis - {{item.name}} Perspective

## Context

You are the lead developer for the {{item.name}}, which is responsible for {{item.description}}. You need to provide requirements for the {{directive.name}} directive type system in Meld.

# Meld documentation

{{files.architectureDocs}}

# Clarity Documentation for {{directive.name}}
{{files.directiveClarityDoc}}

# {{item.name}} Service Code
{{item.code}}

## Task

Think about what your service needs from the {{directive.name}} type system. Consider:

1. What properties must exist in {{directive.name}} types for your service to function correctly?
2. What pain points exist in the current implementation?
3. How would more structured types improve your service's code?
4. What type discriminators would make processing more robust?
5. What validation rules should be enforced at the type level?
6. How should this directive interact with other directives?
7. What interfaces or base types should this directive type extend or implement?

## Output Format

Please provide your requirements in the following format:

### Core Properties
List the essential properties that must exist in the {{directive.name}} directive type system.

### Type Discriminators
Identify key discriminators that distinguish between different variants or uses of this directive.

### Validation Rules
Specify validation constraints that should be enforced at the type level.

### Current Pain Points
Describe issues with the current implementation that the new type system should address.

### Use Cases
Provide concrete examples from your service showing how these types would be used.

### Dependencies
Describe how this directive type system should interact with other parts of Meld.

### Implementation Considerations
For each proposed property or feature, assess:
- Necessity (Essential/Nice-to-have)
- Implementation complexity (High/Medium/Low)
- Reference to concrete use cases 