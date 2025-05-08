# Wrapper Detection System for Meld Grammar

This document outlines a formal system for detecting and tracking syntax wrappers within the Meld grammar system. Similar to our context detection system, the wrapper detection system will provide consistent identification of syntax wrapper patterns across the grammar.

## Motivation

Meld syntax uses several wrapper patterns to denote different content types:

- Double brackets `[[...]]` for template content
- Single brackets `[...]` for paths, commands, and code
- Braces `{...}` for object literals
- Quotes `"..."`, `'...'`, and `` `...` `` for literal strings

Currently, detection of these wrappers is inconsistently implemented across different grammar files. By formalizing and centralizing this detection, we can:

1. Ensure consistent handling of wrapper types
2. Provide richer metadata about content structure
3. Simplify directive implementation logic
4. Improve maintainability and extensibility

## Implementation Plan

### Phase 1: Define Wrapper Type Constants and Helpers

1. Add `WrapperType` constants to `grammar-core.js`:

```javascript
export const WrapperType = {
  DoubleBracket: 'doubleBracket',  // [[...]]
  Bracket: 'bracket',              // [...]
  Brace: 'brace',                  // {...}
  DoubleQuote: 'doubleQuote',      // "..."
  SingleQuote: 'singleQuote',      // '...'
  BackTick: 'backTick',            // `...`
  None: 'none'                     // No wrapper
};
```

2. Add wrapper detection helper methods:

```javascript
// Helper methods for wrapper detection
isDoubleBracketWrapper(input, pos) {
  return pos < input.length - 1 && input[pos] === '[' && input[pos + 1] === '[';
},

isBracketWrapper(input, pos) {
  return pos < input.length && input[pos] === '[' && 
    (pos + 1 >= input.length || input[pos + 1] !== '[');
},

isBraceWrapper(input, pos) {
  return pos < input.length && input[pos] === '{';
},

isQuoteWrapper(input, pos) {
  return pos < input.length && (
    input[pos] === '"' || input[pos] === "'" || input[pos] === '`'
  );
},

getQuoteType(input, pos) {
  if (pos >= input.length) return null;
  
  const char = input[pos];
  if (char === '"') return WrapperType.DoubleQuote;
  if (char === "'") return WrapperType.SingleQuote;
  if (char === '`') return WrapperType.BackTick;
  return null;
},

// Higher-level wrapper detection
getWrapperType(input, pos) {
  if (this.isDoubleBracketWrapper(input, pos)) return WrapperType.DoubleBracket;
  if (this.isBracketWrapper(input, pos)) return WrapperType.Bracket;
  if (this.isBraceWrapper(input, pos)) return WrapperType.Brace;
  
  const quoteType = this.getQuoteType(input, pos);
  if (quoteType) return quoteType;
  
  return WrapperType.None;
}
```

### Phase 2: Implement Wrapper Predicates in Context

Add wrapper predicates to `base/context.peggy`:

```peggy
// WRAPPER DETECTION - Predicates to identify wrapper types

IsDoubleBracketWrapper "Is double bracket template wrapper"
  = &{ 
      const pos = offset();
      return helpers.isDoubleBracketWrapper(input, pos);
    }

IsBracketWrapper "Is bracket content wrapper"
  = &{
      const pos = offset();
      return helpers.isBracketWrapper(input, pos);
    }

IsBraceWrapper "Is brace object wrapper"
  = &{
      const pos = offset();
      return helpers.isBraceWrapper(input, pos);
    }

IsQuoteWrapper "Is quote string wrapper"
  = &{
      const pos = offset();
      return helpers.isQuoteWrapper(input, pos);
    }

// Combined predicate for any wrapper
IsContentWrapper "Is any content wrapper"
  = &{
      const pos = offset();
      return helpers.getWrapperType(input, pos) !== helpers.WrapperType.None;
    }
```

### Phase 3: Update Content Pattern Handling

1. Modify `patterns/content.peggy` to track wrapper types in all content patterns:

```peggy
// For templates in text, add directives
WrappedTemplateContent "Wrapped template content"
  = content:TemplateStyleInterpolation {
      // Construct raw string from the content nodes
      const rawString = helpers.reconstructRawString(content);
      
      // Capture wrapper type information
      const wrapperType = content.wrapperType || helpers.WrapperType.None;
      
      return {
        parts: content,
        raw: rawString,
        wrapperType: wrapperType
      };
    }
```

2. Update the individual content handlers to track wrapper types:

```peggy
TemplateStyleInterpolation "Template interpolation patterns"
  = '[[' content:(InterpolationVar / TemplateTextSegment)* ']]' {
      helpers.debug('TemplateStyleInterpolation matched [[...]] directly');
      
      // Mark this content with its wrapper type
      return {
        content: content,
        wrapperType: helpers.WrapperType.DoubleBracket
      };
    }
  / '"' content:$(!'"' .)* '"' {
      // Process quoted content with wrapper type 
      return {
        content: [helpers.createNode(NodeType.Text, { content }, location())],
        wrapperType: helpers.WrapperType.DoubleQuote
      };
    }
  / "'" content:$(!"'" .)* "'" {
      return {
        content: [helpers.createNode(NodeType.Text, { content }, location())],
        wrapperType: helpers.WrapperType.SingleQuote
      };
    }
  / rule:DoubleBracketContent {
      // DoubleBracketContent already has double bracket wrapper type
      return rule;
    }
```

3. Apply similar patterns to other interpolation handlers:

```peggy
PathStyleInterpolation "Path interpolation patterns"
  = LiteralContent
  / '[' content:(PathVar / PathTextSegment / PathSeparator)* ']' {
      return {
        content: content,
        wrapperType: helpers.WrapperType.Bracket
      };
    }
  / UnquotedPath
```

### Phase 4: Update Directive Cores to Use Wrapper Information

1. Modify `core/template.peggy` to use wrapper type for template detection:

```peggy
TemplateCore
  = template:WrappedTemplateContent {
      // Determine if this is template content based on wrapper and variables
      const hasVariables = template.parts.some(part => 
        part && part.type === NodeType.VariableReference
      );
      
      // Use wrapper type as the primary indicator for template content
      const isTemplateContent = template.wrapperType === helpers.WrapperType.DoubleBracket;
      
      return {
        type: 'template',
        subtype: 'standardTemplate',
        values: { 
          content: template.parts 
        },
        raw: { 
          content: template.raw 
        },
        meta: {
          hasVariables: hasVariables,
          isTemplateContent: isTemplateContent,
          wrapperType: template.wrapperType
        }
      };
    }
```

2. Update `core/path.peggy`:

```peggy
PathCore
  = path:WrappedPathContent {
      // Check if this is a bracketed path
      const isBracketPath = path.wrapperType === helpers.WrapperType.Bracket;
      
      // ... rest of implementation
      
      return {
        type: 'path',
        subtype: 'standardPath',
        values: { 
          path: path.parts 
        },
        raw: { 
          path: path.raw 
        },
        meta: {
          hasVariables: hasVariables,
          isBracketPath: isBracketPath,
          wrapperType: path.wrapperType
        }
      };
    }
```

3. Similarly update `code.peggy` and `command.peggy`

### Phase 5: Update Directive Implementations

1. Modify `directives/text.peggy` to use wrapper information:

```peggy
AtText
  = DirectiveContext "@text" _ id:BaseIdentifier _ "=" _ template:TemplateCore {
      // Use both hasVariables and isTemplateContent (from wrapper) to determine subtype
      const isTemplate = template.meta.hasVariables || template.meta.isTemplateContent;
      
      // Determine subtype and sourceType based on template detection
      const subtype = isTemplate ? 'textTemplate' : 'textAssignment';
      const sourceType = isTemplate ? 'template' : 'literal';
      
      // Create meta object with template info, including wrapper type
      const meta = { 
        sourceType: sourceType,
        hasVariables: template.meta.hasVariables,
        isTemplateContent: template.meta.isTemplateContent,
        wrapperType: template.meta.wrapperType
      };
      
      // ... rest of implementation
    }
```

2. Update the `add.peggy` to specifically handle section detection:

```peggy
// For section add variant
DirectiveContext "@add" _ sectionTitle:QuotedContent _ "from" _ path:PathCore _ asTitle:AsNewTitle? {
    // We know from the wrapper type that this is a quoted section title
    const titleWrapperType = sectionTitle.wrapperType;
    
    // Create metadata including wrapper types
    const meta = {
      path: {
        // ... existing path metadata
      },
      sourceTitle: {
        wrapperType: titleWrapperType
      }
    };
    
    return helpers.createStructuredDirective(
      'add', 
      'addSection',  // Explicitly using addSection subtype
      values, 
      raw, 
      meta, 
      location(),
      'section'  // Source parameter
    );
  }
```

## Integration Strategy

1. **Start with Core Abstractions**: Implement wrapper detection in helpers and context first
2. **Update Pattern Abstractions**: Modify pattern handlers to track wrapper types
3. **Update Core Handlers**: Update template, path, command, and code cores to use wrapper information
4. **Update Directives**: Finally update directive implementations to use wrapper information

## Testing Strategy

1. Create unit tests for each wrapper type detection
2. Test edge cases like nested wrappers or partially matching wrappers
3. Verify correct AST structure with wrapper metadata
4. Ensure backward compatibility with existing directive behavior

## Expected Benefits

1. **Precise Content Classification**: More accurate determination of content types
2. **Simplified Directive Logic**: Directives can use wrapper type directly instead of inference logic
3. **Enhanced Metadata**: AST nodes have richer content structure information
4. **Consistent Behavior**: All directives handle wrappers in the same way
5. **Easier Extensibility**: Adding new wrapper types becomes straightforward

## Future Extensions

This system could be extended to support:
- Detection of nested wrapper patterns
- Custom syntax highlighting based on wrapper types
- Specialized error messages for mismatched wrappers
- Content validation based on expected wrapper types