// INTERPOLATION PATTERNS
// Reusable combinatory patterns built on top of the core interpolation.peggy patterns
// These patterns provide specific combinations for different directive needs

// -------------------------------------------------------------
// COMPOSITE PATTERNS - Combinations of basic patterns
// -------------------------------------------------------------

// PATTERN COMBO 1: All interpolation types (1,2,3,4)
AllInterpolationTypes
  = DoubleBracketContainer
  / BracketContainer
  / UnquotedPath
  / LiteralString

// PATTERN COMBO 2: Literal quotes, brackets, implied brackets (1,2,3)
PathStyleInterpolation
  = BracketContainer
  / UnquotedPath
  / LiteralString

// PATTERN COMBO 3: Brackets and implied brackets only (2,3)
BracketStyleInterpolation
  = BracketContainer
  / UnquotedPath

// PATTERN COMBO 4: Literal quotes and double brackets (1,4)
TemplateStyleInterpolation
  = DoubleBracketContainer
  / LiteralString

// -------------------------------------------------------------
// SPECIALIZED WRAPPED PATTERNS FOR SPECIFIC DIRECTIVES
// -------------------------------------------------------------

// For text/add templates - all container types in one pattern
WrappedTemplateContent
  = content:TemplateStyleInterpolation {
      return {
        parts: content,
        raw: helpers.reconstructRawString(content)
      };
    }

// For paths in path, import, exec, run directives
WrappedPathContent
  = content:PathStyleInterpolation {
      return {
        parts: content,
        raw: helpers.reconstructRawString(content)
      };
    }
  
// For pure path references (brackets and unquoted only)
WrappedPurePath
  = content:BracketStyleInterpolation {
      return {
        parts: content,
        raw: helpers.reconstructRawString(content)
      };
    }

// For commands in exec, run directives
WrappedCommandContent
  = content:AllInterpolationTypes {
      return {
        parts: content,
        raw: helpers.reconstructRawString(content)
      };
    }

// For code blocks in exec, run directives (no interpolation)
WrappedCodeContent
  = "[" content:$(!']' .)* "]" { 
      const textNode = [helpers.createNode(NodeType.Text, { content }, location())];
      return {
        parts: textNode,
        raw: content
      };
    }