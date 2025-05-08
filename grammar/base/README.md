# Meld Grammar Base Abstractions

This directory contains the fundamental abstractions used throughout the Meld grammar system. These form the core building blocks for all higher-level grammar patterns.

## Context Detection System

The context detection system (`context.peggy`) provides predicates for disambiguating different contexts in which the `@` symbol appears, including:

- **Directive Context**: Top-level directives like `@run`, `@text`
- **Variable Context**: Variable references like `@varName` within content
- **RHS Context**: Right-hand side expressions like `value = @run [command]`
- **Plain Text Context**: Regular text containing `@` characters

### Using Context Predicates

Context predicates are designed to be used with grammar rules to create context-aware parsing:

```peggy
// Example: Only match variable references, not directives
AtVar
  = "@" VariableContext identifier:BaseIdentifier {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier
      }, location());
    }

// Example: Only match top-level directives 
AtRun 
  = "run" DirectiveContext _ command:RunCommandCore {
      // Implementation
    }
```

### Context Detection Architecture

The context detection relies on a set of helper methods that analyze the input based on:

1. **Position Analysis**: Line start detection, nearby characters
2. **Pattern Analysis**: Looking ahead for identifiers, directive keywords
3. **Hierarchical Classification**: From most specific to least specific context

This provides a unified foundation for disambiguating syntax elements throughout the grammar.

## Base Token Abstractions

Base tokens (`tokens.peggy`) provide the atomic elements used throughout the grammar:

- **Identifiers**: Variable and directive names
- **Separators**: Path, section, and other delimiter characters 
- **Literals**: String, number, and other literal values

## Segment Abstractions

Text segments (`segments.peggy`) define the patterns for text content in different contexts:

- **Base Text**: Regular text without special characters
- **Template Text**: Text allowing certain interpolation
- **Command Text**: Text with command-specific rules

## Design Principles

1. **Abstraction Hierarchy**: Base abstractions should only depend on core helpers
2. **Context Sensitivity**: Use context predicates to disambiguate similar syntax
3. **Semantic Naming**: Names should reflect the role in the grammar, not just syntax
4. **Self-Documentation**: Rules include descriptions for clarity
5. **Debugging Support**: Consistent debug logging for diagnostic purposes