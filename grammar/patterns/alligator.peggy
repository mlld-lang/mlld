// ALLIGATOR PATTERN - Content Loading Syntax
// Syntax: <path/to/file.md> or <https://example.com> or <file.md # Section>
// Purpose: Unambiguous content loading from files, URLs, or future sources

/*
# Alligator Pattern

The alligator syntax (<>) clearly indicates "load content from source".
No ambiguity with arrays or strings.

## Examples:
- <README.md> - Load file content
- <docs/guide.md # Installation> - Load section from file
- <https://api.example.com/data.json> - Load from URL
- <./relative/path.txt> - Load from relative path
- <@npm/package> - Future: load from module

## Features:
1. Path interpolation: <@baseDir/file.md>
2. Section extraction: <file.md # Section>
3. Section rename: <file.md # Section> as "## New Title"
4. Pipe transformations: <file.txt>|@upper|@trim
5. Future: AST extraction, range extraction
*/

// Main alligator expression
AlligatorExpression "alligator expression"
  = "<" _ source:AlligatorSource options:AlligatorOptions? _ ">" pipes:CondensedPipeChain? {
      helpers.debug('AlligatorExpression matched', { source, options, pipes });
      return {
        type: 'load-content',
        source: source,
        ...(options ? { options } : {}),
        ...(pipes && pipes.length > 0 ? { pipes } : {}),
        location: location()
      };
    }

// Source types - what we're loading from
AlligatorSource
  = AlligatorURL       // https://example.com/page
  / AlligatorPath      // file.md, ./relative/path.js

// URL source - for web content
AlligatorURL "URL source"
  = protocol:("https" / "http") "://" host:URLHost path:URLPath? {
      helpers.debug('AlligatorURL matched', { protocol, host, path });
      return {
        type: 'url',
        protocol: protocol,
        host: host,
        path: path || '/',
        raw: text()
      };
    }

// Path source - for local files
AlligatorPath "file path source"
  = AlligatorQuotedPath
  / AlligatorUnquotedPath

// Quoted path - handles paths with spaces
AlligatorQuotedPath "quoted path"
  = '"' chars:QuotedPathChar* '"' {
      helpers.debug('AlligatorQuotedPath matched', { chars });
      const pathString = chars.join('');
      const textNode = helpers.createNode(NodeType.Text, { 
        content: pathString, 
        location: location() 
      });
      return {
        type: 'path',
        segments: [textNode],
        raw: pathString,
        meta: helpers.createPathMetadata(pathString, [textNode])
      };
    }

// Unquoted path - the existing implementation
AlligatorUnquotedPath "unquoted path"
  = parts:AlligatorPathParts {
      helpers.debug('AlligatorUnquotedPath matched', { parts });
      const pathString = helpers.reconstructRawString(parts);
      return {
        type: 'path',
        segments: parts,
        raw: pathString,
        meta: helpers.createPathMetadata(pathString, parts)
      };
    }

// Characters allowed in quoted paths
QuotedPathChar
  = !'"' char:. { return char; }

// Path parts that can include variables
AlligatorPathParts "alligator path parts"
  = parts:(AlligatorVariable / AlligatorPathSegment / PathSeparator)+ {
      return parts;
    }

// Variable reference inside alligator (no context check needed)
AlligatorVariable "alligator variable"
  = "@" id:BaseIdentifier fields:AnyFieldAccess* {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }

// Path segment - text that's not a separator or variable
AlligatorPathSegment "alligator path segment"
  = chars:AlligatorPathChar+ {
      return helpers.createNode(NodeType.Text, { 
        content: chars.join(''), 
        location: location() 
      });
    }

// Valid characters in path segments (inside alligators)
AlligatorPathChar
  = !">" !"#" !"@" !" as " !PathSeparator char:. { return char; }

// Options for alligator expressions
AlligatorOptions
  = _ section:SectionClause _ transform:AsTransform {
      // Section with transform - try this first
      const options = { section };
      options.transform = transform;
      return options;
    }
  / _ section:SectionClause _ rename:AsRename {
      // Section with rename - only if not transform
      const options = { section };
      section.renamed = rename;
      return options;
    }
  / _ section:SectionClause {
      // Just section without transform or rename
      return { section };
    }
  / _ transform:AsTransform {
      // Just the transform without section
      return { transform };
    }

// Section extraction clause
SectionClause
  = "#" _ identifier:AlligatorSectionIdentifier {
      helpers.debug('SectionClause matched', { identifier });
      return {
        type: 'section',
        identifier: identifier
      };
    }

// Section identifier - can be literal or variable  
AlligatorSectionIdentifier "alligator section identifier"
  = "@" varRef:BaseIdentifier fields:FieldAccess* {
      // Variable reference as section name
      return helpers.createVariableReferenceNode('sectionVariable', {
        identifier: varRef,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / chars:AlligatorSectionChar+ { 
      // Literal section name
      const content = chars.join('').trim();
      return helpers.createNode(NodeType.Text, { 
        content: content, 
        location: location() 
      }); 
    }

// Characters allowed in section names (inside alligators)
AlligatorSectionChar
  = !">" !"as" char:. { return char; }

// Rename clause for sections
AsRename "section rename"
  = _ "as" _ title:AsSectionRenameString {
      return {
        type: 'rename-template',
        parts: title
      };
    }

// Parse the content of a quoted or backtick string as a template for section rename
// Supports both "..." and `...` with <> placeholder interpolation
AsSectionRenameString "section rename string template"
  = '"' parts:RenameStringPart* '"' {
      return parts;
    }
  / '`' parts:RenameBacktickPart* '`' {
      return parts;
    }

// Parts inside rename string - reuse file reference interpolation
RenameStringPart
  = FileReferenceInterpolation  // Reuse the existing pattern that handles <> and <file> 
  / chars:(![<"] char:. { return char; })+ {
      // Plain text
      return helpers.createNode(NodeType.Text, { 
        content: chars.join(''), 
        location: location() 
      });
    }

// Parts inside rename backtick template - supports <> placeholder and @variables
RenameBacktickPart
  = FileReferenceInterpolation  // Handles <> and <file> with field access
  / "@" id:BaseIdentifier fields:AnyFieldAccess* {
      // Regular variable reference
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / chars:(![`<@] char:. { return char; })+ {
      // Plain text
      return helpers.createNode(NodeType.Text, { 
        content: chars.join(''), 
        location: location() 
      });
    }

// Transform clause for array elements
AsTransform "as transform"
  = _ "as" _ template:AlligatorTransformTemplate {
      return template;
    }

// Backtick template for transformations
AlligatorTransformTemplate "alligator transform template"
  = "`" parts:BacktickTransformPart* "`" {
      return {
        type: 'template',
        parts: parts
      };
    }

// Parts inside transform template - supports <> placeholder
BacktickTransformPart
  = "<>" fields:TransformFieldChain? {
      // Placeholder for current item with optional field access
      return {
        type: 'placeholder',
        fields: fields
      };
    }
  / "@" id:BaseIdentifier fields:AnyFieldAccess* {
      // Regular variable reference
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: id,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / chars:(![`<@] char:. { return char; })+ {
      // Plain text
      return helpers.createNode(NodeType.Text, { 
        content: chars.join(''), 
        location: location() 
      });
    }

// Field access for transform placeholders
TransformFieldChain
  = "." first:TransformField rest:("." field:TransformField { return field; })* {
      return [first, ...rest];
    }

// Individual field in transform
TransformField
  = id:BaseIdentifier {
      return {
        type: 'field',
        value: id
      };
    }

// URL components
URLHost
  = chars:[a-zA-Z0-9.-]+ { return chars.join(''); }

URLPath  
  = "/" chars:[^> ]* { return '/' + chars.join(''); }

