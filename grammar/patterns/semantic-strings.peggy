// SEMANTIC STRING PATTERNS
// Purpose: Context-specific string patterns for different uses in mlld
// Implements the Semantic Fork Pattern for string handling

// DataString - For data contexts that need raw JavaScript strings
DataString "Data Context String"
  = "'" content:EscapedSingleStringContent "'" { return content; }
  / '"' parts:(SpecialVariable / FileReferenceInterpolation / VariableWithPipes / DoubleQuotedText)* '"' {
      // In data context, we need to evaluate interpolation immediately
      if (parts.length === 1 && parts[0].type === 'Text') {
        return parts[0].content;
      }
      // Return marker for runtime interpolation
      return { needsInterpolation: true, parts };
    }

// TemplateString - For template contexts that need AST nodes
TemplateString "Template Context String"  
  = "'" content:EscapedSingleStringContent "'" {
      return [helpers.createNode(NodeType.Text, { content, location: location() })];
    }
  / quote:UnifiedDoubleQuote { return quote.content; }  // Extract content from unified quote

// ExpressionString - For expression contexts that need typed Literal nodes
ExpressionString "Expression Context String"
  = "'" content:EscapedSingleStringContent "'" {
      return helpers.createNode('Literal', { value: content, valueType: 'string', location: location() });
    }
  / '"' parts:(SpecialVariable / FileReferenceInterpolation / VariableWithPipes / DoubleQuotedText)* '"' {
      if (parts.length === 1 && parts[0].type === 'Text') {
        return helpers.createNode('Literal', { value: parts[0].content, valueType: 'string', location: location() });
      }
      // Return the same structure as TemplateStyleInterpolation for consistency
      return {
        content: parts,
        wrapperType: 'doubleQuote'
      };
    }