// meld.pegjs
// Meld grammar implementation

{
  // NodeType, DirectiveKind, and helpers are injected via parser-dependencies
}

/* structural newline that should become an AST node */
InterDirectiveNewline
  = ws:[ \t\r]* term:LineTerminator &{
      /* scan forward past spaces/tabs (NOT newlines) */
      let i = offset();
      while (i < input.length && (input[i] === ' ' || input[i] === '\t' || input[i] === '\r')) {
        i++;
      }
      /* success only if the next real char starts a directive line */
      return i < input.length && input[i] === '@' && helpers.isLogicalLineStart(input, i);
    } {
      return helpers.createNode(NodeType.Newline, { content: term }, location());
    }

/* plain newline that should stay a raw string */
ContentEOL               /* ← drop-in replacement for the old EndOfLine */
  = ws:[ \t\r]* term:LineTerminator { return term; }

/* peek for newline/EOF without consuming */
DirectiveEOL
  = &( LineTerminator / EOF )
  / _[ \t\r]* &( LineTerminator / EOF )

Start
  = nodes:(
      LineStartComment
    / Comment
    / CodeFence
    / Variable
    / Directive              /* <— first try to match directives */
    / InterDirectiveNewline   /* <— then capture newlines between directives */
    / TextBlock
    )* {
    helpers.debug('Start: Entered');
    return nodes;
  }

LineStartComment
  = &{ 
      const pos = offset();
      const isAtLineStart = helpers.isLogicalLineStart(input, pos);
      return isAtLineStart;
    } ">>" [ ] content:CommentContent {
    return helpers.createNode(NodeType.Comment, { content: content.trim() }, location());
  }

Comment
  = ">>" [ ] content:CommentContent {
    return helpers.createNode(NodeType.Comment, { content: content.trim() }, location());
  }

CommentContent
  = chars:[^\n]* "\n"? {
    return chars.join('');
  }

_ "whitespace"
  = [ \t\r\n\u200B\u200C\u200D]*

__ "mandatory whitespace"
  = [ \t\r\n]+

/* horizontal whitespace (NO newlines) */
HWS "horizontal whitespace"
  = [ \t\r\u200B\u200C\u200D]*

TextBlock
  = first:TextPart rest:(TextPart)* {
    return helpers.createNode(NodeType.Text, { content: first + rest.join('') }, location());
  }

TextPart
  = !{ 
      const pos = offset();
      const isAtLineStart = helpers.isLogicalLineStart(input, pos);
      const isDirective = isAtLineStart && input.substr(pos, 1) === '@' && 
                         /[a-z]/.test(input.substr(pos+1, 1));
      
      const isComment = isAtLineStart && input.substr(pos, 2) === '>>';
      
      return isDirective || isComment;
    } !(
       "{{"           /* still block the opening of a text-var */
     / "}}"           /* …and its closing */
     / "[["           /* block multiline-template opening */
     / "]]"           /* …and its closing */
     / BacktickSequence  /* keep blocking fence openers (``, ``` etc.) */
    ) &{
      const pos = offset();
      helpers.trace(pos, 'brace/backtick guard');
      return true;
    } char:. { 
      return char; 
    }

Variable
  = TextVar
  / DataVar
  / PathVar

TextVar
  = "{{" _ id:Identifier format:VarFormat? _ "}}" {
      // helpers.debug('TEXTVAR_MATCH', `Matched TextVar: {{${id}}}`); // REMOVED DEBUG LOG
      const node = helpers.createVariableReferenceNode('text', {
        identifier: id,
        ...(format ? { format } : {})
      }, location());
      helpers.debug('CreateVAR', { rule: 'TextVar', node }); // <<< ADD DEBUG LOG
      helpers.debug('VAR_CREATE', `Created {{${id}}} node`, JSON.stringify(node)); // <<< ADDED DEBUG LOG
      return node;
  }

DataVar
  = "{{" _ id:Identifier accessElements:(FieldAccess / NumericFieldAccess / ArrayAccess)* format:VarFormat? _ "}}" {
    const node = helpers.createVariableReferenceNode('data', {
      identifier: id,
      fields: accessElements || [],
      ...(format ? { format } : {})
    }, location());
    helpers.debug('CreateVAR', { rule: 'DataVar', node }); // <<< ADD DEBUG LOG
    return node;
  }

PathVar
  = "$" id:(SpecialPathChar / Identifier) {
      const normalizedId = helpers.normalizePathVar(id);
      const node = helpers.createVariableReferenceNode('path', {
        identifier: normalizedId,
      }, location());
      helpers.debug('CreateVAR', { rule: 'PathVar', node }); // <<< ADD DEBUG LOG
      return node;
    }

PathIdentifier
  = SpecialPathChar
  / [a-zA-Z_][a-zA-Z0-9_]* { return text(); }

SpecialPathIdentifier
  = "HOMEPATH" / "~" / "PROJECTPATH" / "." {
    return text();
  }

FieldAccess
  = "." field:Identifier {
    return { type: 'field', value: field };
  }

NumericFieldAccess
  = "." index:NumericIndentifier {
    return { type: 'index', value: parseInt(index, 10) };
  }

NumericIndentifier
  = digits:[0-9]+ {
    return digits.join('');
  }

ArrayAccess
  = "[" index:(NumberLiteral / StringLiteral / Identifier) "]" {
    return { type: 'index', value: index };
  }

VarFormat
  = ">>" format:Identifier {
    return format;
  }

// --- Interpolation Rules ---

// Double Quotes
DoubleQuoteAllowedLiteralChar
  = !('"' / '{{' / '\\\\') char:. { return char; }
  / '\\\\' esc:. { return '\\\\' + esc; }

DoubleQuoteLiteralTextSegment
  = chars:DoubleQuoteAllowedLiteralChar+ {
      return helpers.createNode(NodeType.Text, { content: chars.join('') }, location());
    }

DoubleQuoteInterpolatableContent
  = parts:(DoubleQuoteLiteralTextSegment / Variable)+ {
      return parts;
    }

DoubleQuoteInterpolatableContentOrEmpty
  = result:DoubleQuoteInterpolatableContent? {
      return result || [];
    }

// Single Quotes
SingleQuoteAllowedLiteralChar
  = !('\'' / '{{' / '\\\\') char:. { return char; }
  / '\\\\' esc:. { return '\\\\' + esc; }

SingleQuoteLiteralTextSegment
  = chars:SingleQuoteAllowedLiteralChar+ {
      return helpers.createNode(NodeType.Text, { content: chars.join('') }, location());
    }

SingleQuoteInterpolatableContent
  = parts:(SingleQuoteLiteralTextSegment / Variable)+ {
      return parts;
    }

SingleQuoteInterpolatableContentOrEmpty
  = result:SingleQuoteInterpolatableContent? {
      return result || [];
    }

// Backticks (Template Literals)
BacktickAllowedLiteralChar
  = !('`' / '{{' / '\\\\') char:. { return char; }
  / '\\\\' esc:. { return '\\\\' + esc; }

BacktickLiteralTextSegment
  = chars:BacktickAllowedLiteralChar+ {
      return helpers.createNode(NodeType.Text, { content: chars.join('') }, location());
    }

BacktickInterpolatableContent
  = parts:(BacktickLiteralTextSegment / Variable)+ {
      return parts;
    }

BacktickInterpolatableContentOrEmpty
  = result:BacktickInterpolatableContent? {
      return result || [];
    }

// Multiline [[...]]
MultilineAllowedLiteralChar
  = !']]' !'{{' !('\\\\') char:. { return char; }
  / '\\\\' esc:. { return '\\\\' + esc; }

MultilineLiteralTextSegment
  = chars:MultilineAllowedLiteralChar+ {
      return helpers.createNode(NodeType.Text, { content: chars.join('') }, location());
    }

MultilineInterpolatableContent
  = parts:(MultilineLiteralTextSegment / Variable)+ {
      return parts;
    }

MultilineInterpolatableContentOrEmpty
  = result:MultilineInterpolatableContent? {
      return result || [];
    }

// --- End Interpolation Rules ---

// --- Interpolated Literal Rules ---

PathStringLiteral "String literal with potential path variables"
  = '"' content:PathStringContent '"' { return content; }
  / "'" content:PathStringContent "'" { return content; }
  / "`" content:PathStringContent "`" { return content; }

PathStringContent
  = parts:(PathVar / PathText / PathSeparator)+ {
      return parts;
    }

PathText
  = chars:PathAllowedChar+ {
      return helpers.createNode(NodeType.Text, { content: chars.join('') }, location());
    }

PathAllowedChar
  = !('"' / "'" / '`' / '$' / '/' / '\\') char:. { return char; }
  / '\\' esc:. { return '\\' + esc; }

PathSeparator
  = '/' { return helpers.createNode(NodeType.PathSeparator, { value: '/' }, location()); }

InterpolatedStringLiteral "String literal with potential variable interpolation"
  = '"' content:DoubleQuoteInterpolatableContentOrEmpty '"' { return content; }
  / "'" content:SingleQuoteInterpolatableContentOrEmpty "'" { return content; }
  / "`" content:BacktickInterpolatableContentOrEmpty "`" { return content; }

InterpolatedMultilineTemplate "Multiline template with potential variable interpolation"
  = "[[" content:MultilineInterpolatableContentOrEmpty "]]" { return content; }

// --- End Interpolated Literal Rules ---

// Helper rule for parsing RHS @embed variations
// Returns { subtype: '...', ... } structure without 'source' field.
_EmbedRHS
   = _ "[[" content:MultilineInterpolatableContentOrEmpty "]]" _[ \t]* options:DirectiveOptions? {
     return {
       subtype: 'embedTemplate',
       content: content,
       isTemplateContent: true,
       ...(options ? { options } : {})
     };
   }
   / _ "[" content:BracketInterpolatableContentOrEmpty "]" options:DirectiveOptions? {
     // 1. Find section marker and split the array
     const sectionMarkerIndex = content.findIndex(p => p.type === NodeType.SectionMarker);
     const pathParts = sectionMarkerIndex === -1 ? content : content.slice(0, sectionMarkerIndex);
     const sectionParts = sectionMarkerIndex === -1 ? [] : content.slice(sectionMarkerIndex + 1);

     // DEBUG: Log pathParts before flag calculation
     helpers.debug('EMBED_RHS_PRE_FLAGS', 'PathParts before flag calc:', JSON.stringify(pathParts));

     // 2. Reconstruct raw strings (using the fixed helper)
     const rawPath = helpers.reconstructRawString(content).trim();
     const rawSection = helpers.reconstructRawString(sectionParts).trim() || null;
     const pathOnly = helpers.reconstructRawString(pathParts).trim();

     // 3. Split content into path parts and section
     helpers.debug('EMBED_RHS_CONTENT', 'Full content:', JSON.stringify(content));
     helpers.debug('EMBED_RHS_PATH_PARTS', 'Path parts:', JSON.stringify(pathParts));
     // Validate path using only the path-portion (before any # section)
     const finalPathObject = helpers.validatePath(pathParts, DirectiveKind.embed);
     finalPathObject.raw = pathOnly;
     finalPathObject.values = content; // Keep all parts including section

     helpers.debug('EmbedPath_New', { rawPath, rawSection, finalPathObject, content });

     return {
       kind: 'embed',
       subtype: 'embedPath',
       path: finalPathObject,
       ...(rawSection ? { section: rawSection } : {}),
       ...(options ? { options } : {})
     };
   }
   / _ variable:Variable options:DirectiveOptions? {
      // Handle variable references (e.g. {{variable}} or {{users[0].roles[1]}})
      return {
        subtype: 'embedVariable',
        values: [variable],
        ...(options ? { options } : {})
      };
    }

// Helper rule for parsing RHS @run variations
// Returns { subtype: '...', ... } structure without 'source' field.
_RunRHS
  = _ cmdRef:CommandReference {
      const commandObj = {
        raw: `$${cmdRef.name}${cmdRef.args.length > 0 ? `(${cmdRef.args.map(arg => {
          if (arg.type === 'string') return `\"${arg.value}\"`;
          if (arg.type === 'variable') return arg.value.raw || '';
          return arg.value;
        }).join(', ')})` : ''}`,
        name: cmdRef.name,
        args: cmdRef.args
      };
      return {
        subtype: 'runDefined',
        command: commandObj
      };
    }
  / _ lang:Identifier? _ params:RunVariableParams? _ "[[" content:MultilineInterpolatableContentOrEmpty "]]" _[ \t]* {
      return {
        subtype: params ? 'runCodeParams' : 'runCode',
        command: content,
        ...(lang ? { language: lang } : {}),
        ...(params ? { parameters: params } : {}),
        isMultiLine: true
      };
    }
  / _ "[" content:BracketInterpolatableContentOrEmpty "]" {
      return {
        subtype: 'runCommand',
        values: content // Changed 'command' to 'values'
      };
    }

CommandReference
  = "$" name:Identifier _ args:CommandArgs? { 
      return {
        name,
        args: args || [],
        isCommandReference: true
      };
    }

CommandArgs
  = "(" _ args:CommandArgsList? _ ")" {
      return args || [];
    }

CommandArgsList
  = first:CommandArg rest:(_ "," _ arg:CommandArg { return arg; })* {
      const result = [first, ...rest];
      return result;
    }

CommandArg
  = str:StringLiteral { 
      const result = { type: 'string', value: str };
      return result; 
  }
  / varRef:Variable { 
      return varRef; 
  }
  / chars:RawArgChar+ { 
      const result = { type: 'raw', value: chars.join('').trim() }; 
      return result;
  }

RawArgChar
  = !("," / ")") char:. { return char; }

Directive
  = &{ return helpers.isLogicalLineStart(input, offset()); }
    [ \t]* "@"                       // allow leading tabs/spaces
    dir:(
      ImportDirective_Simple / ImportDirective_WithClause
    / EmbedDirective
    / RunDirective
    / DefineDirective
    / DataDirective
    / TextDirective
    / PathDirective
    / VarDirective
    ) { return dir; }

RunDirective
  = "run" _ "[" content:BracketInterpolatableContent "]" {
      const raw = content.map(n => {
        if (n.type === 'Text') return n.content;
        if (n.type === 'VariableReference') return `{{${n.identifier}}}`;
        return '';
      }).join('');
      return helpers.createDirective('run', {
        subtype: 'runCommand',
        raw,
        values: content
      }, location());
    }
  / "run" _ cmdRef:CommandReference _ HWS DirectiveEOL { 
      const { name, args: params } = cmdRef;
      return helpers.createDirective('run', {
        subtype: 'runDefined',
        raw: `$${name}`,
        values: [
          helpers.createVariableReferenceNode('path', { identifier: name, isVariableReference: true }, location())
        ],
        args: params || []
      }, location());
    }
  / "run" _ language:Identifier _ "[" _ code:$([^\[\]]+) _ "]" {
      return helpers.createDirective('run', {
        subtype: 'runCode',
        language,
        values: [
          helpers.createNode('Text', { content: code.trim() }, location())
        ]
      }, location());
    }

  / "run" _ lang:Identifier _ "(" params:RunVariableParams ")" _ "[" code:BracketInterpolatableContentOrEmpty "]" header:UnderHeader? HWS DirectiveEOL {
      const clean = code.filter(
        n => !(n.type === 'Text' && /^\s*$/.test(n.content))
      ).map(node => {
        if (node.type === 'Text') {
          return helpers.createNode('Text', { content: node.content.trim() }, location());
        }
        return node;
      });
      return helpers.createDirective('run', {
        subtype: 'runCodeParams',
        language: lang,
        values: clean,
        args: params,
        ...(header ? { underHeader: header } : {})
      }, location());
    }
  RunVariableParams
  = params:RunParamsList? {
      return params || [];
    }

RunParamsList
  = first:RunParam rest:(_ "," _ param:RunParam { return param; })* {
      return [first, ...rest].filter(Boolean);
    }

RunParam
  = varName:("{{" _ name:Identifier _ "}}" { return name; } / "(" _ name:Identifier _ ")" { return name; }) {
      return helpers.createVariableReferenceNode('text', { identifier: varName }, location());
    }
  / StringLiteral
  / identifier:Identifier { return identifier; }

ImportDirective_Simple
  = _ "import" _ pathParts:PathValue _ { // Changed path to pathParts
    // REMOVED: helpers.debug('IMPORT_BRACKET_PATH_RECEIVED_PARTS', 'Received parts:', JSON.stringify(pathParts)); // <<< ADDED DEBUG LOG
    const pathData = helpers.validatePath(pathParts); // Pass parts directly
    // UPDATED: Explicitly set subtype (Task 3.2)
    return helpers.createDirective('import', { subtype: helpers.getImportSubtype([]), path: pathData, imports: undefined }, location());
  }

ImportDirective_WithClause
  = "import" _ "[" _ imports:ImportsList _ "]" _ "from" _ "[" pathParts:BracketInterpolatableContentOrEmpty "]" HWS DirectiveEOL {
      const validatedPath = helpers.validatePath(pathParts);
      const directiveData = {
        subtype: helpers.getImportSubtype(imports),
        path: validatedPath,
        imports: imports
      };
      return helpers.createDirective('import', directiveData, location());
    }
  / "import" _ "[" _ imports:ImportsList _ "]" _ "from" __ variable:Variable HWS DirectiveEOL {
    const validatedPath = helpers.validatePath([variable]);
    const directiveData = {
      subtype: helpers.getImportSubtype(imports),
      path: validatedPath,
      imports: imports
    };
    return helpers.createDirective('import', directiveData, location());
  }
  / // Traditional import (backward compatibility)
    "import" _ "[" pathParts:BracketInterpolatableContentOrEmpty "]" DirectiveEOL {
      // REMOVED: helpers.debug('IMPORT_BRACKET_PATH_RECEIVED_PARTS', 'Received parts:', JSON.stringify(pathParts)); // <<< ADDED DEBUG LOG
      const validatedPath = helpers.validatePath(pathParts);
      const implicitImports = [{name: "*", alias: null}];
      const directiveData = {
        subtype: helpers.getImportSubtype(implicitImports),
        path: validatedPath,
        imports: implicitImports
      };
      return helpers.createDirective('import', directiveData, location());
    }
  / // Traditional import with variable (backward compatibility)
    "import" __ variable:Variable DirectiveEOL {
      const validatedPath = helpers.validatePath([variable]);
      const implicitImports = [{name: "*", alias: null}];
      const directiveData = {
        subtype: helpers.getImportSubtype(implicitImports),
        path: validatedPath,
        imports: implicitImports
      };
      return helpers.createDirective('import', directiveData, location());
    }

// Rules for parsing import lists
ImportsList
  = "*" {
      return [{name: "*", alias: null}];
    }
  / first:ImportItem rest:(_ "," _ item:ImportItem { return item; })* {
      return [first, ...rest];
    }
  / _ {
      return [];
    }

ImportItem
  = name:Identifier _ "as" _ alias:Identifier { // Explicitly match 'name as alias'
      return {name, alias: alias};
    }
  / name:Identifier { // Fallback for 'name' without alias
      return {name, alias: null};
    }

ImportAlias
  = _ "as" _ alias:Identifier {
      return alias;
    }

EmbedDirective
  = "embed" embedResult:_EmbedRHS headerLevel:HeaderLevel? underHeader:UnderHeader? HWS DirectiveEOL {
      const directiveData = {
        ...embedResult,
        ...(headerLevel ? { headerLevel } : {}),
        ...(underHeader ? { underHeader } : {})
      };

      return helpers.createDirective('embed', directiveData, location());
    }
  / "embed" _ "[[" content:MultilineContent "]]" _ HWS DirectiveEOL {
    return helpers.createDirective('embed', {
      subtype: 'embedMultiline',
      content: content,
    }, location());
  }
  / "embed" _ "{" _ names:NameList _ "}" _ "from" _ content:DirectiveContent options:DirectiveOptions? header:HeaderLevel? under:UnderHeader? DirectiveEOL {
    const [path, section] = content.split('#');
    const sectionTrimmed = section ? section.trim() : null;
    
    helpers.validateEmbedPath(path);
    
    return helpers.createDirective('embed', {
      subtype: 'embedPath',
      path: helpers.validatePath(path),
      ...(sectionTrimmed ? { section: sectionTrimmed } : {}),
      names,
      ...(options ? { options } : {}),
      ...(header ? { headerLevel: header } : {}),
      ...(under ? { underHeader: under } : {})
    }, location());
  }

NameList
  = first:Identifier rest:(_ "," _ id:Identifier { return id; })* {
    return [first, ...rest];
  }
  / _ { return []; }

HeaderLevel
  = _ "as" _ level:("#"+) {
    return level.length;
  }

UnderHeader
  = _ "under" _ header:TextUntilNewline {
    return header.trim();
  }

IdentifierList
  = first:Identifier rest:(_ "," _ id:Identifier { return id; })* {
    return [first, ...rest];
  }

DefineDirective
  = "define" _ id:DefineIdentifier params:DefineParams? _ "=" _ value:DefineValue HWS DirectiveEOL {
    if (value.type === "run") {
      helpers.validateRunContent(value.value.command);
    } else if (typeof value.value === "string") {
      helpers.validateDefineContent(value.value);
    }
    
    if (value.type === "run") {
      return helpers.createDirective('define', {
        name: id.name,
        ...(id.field ? { field: id.field } : {}),
        ...(params ? { parameters: params } : {}),
        command: value.value
      }, location());
    } else {
      return helpers.createDirective('define', {
        name: id.name,
        ...(id.field ? { field: id.field } : {}),
        ...(params ? { parameters: params } : {}),
        value: value.value
      }, location());
    }
  }

DefineIdentifier
  = name:Identifier field:DefineField? {
    return { name, ...(field ? { field } : {}) };
  }

DefineField
  = "." field:(
      "risk.high"
    / "risk.med"
    / "risk.low"
    / "risk"
    / "about"
    / "meta"
  ) {
    return field;
  }

DefineParams
  = _ "(" _ params:IdentifierList _ ")" {
    return params;
  }

DefineValue
  = "@run" _ "[" content:BracketInterpolatableContentOrEmpty "]" {
      const raw = content.map(n => {
        if (n.type === 'Text') return n.content;
        if (n.type === 'VariableReference') return `{{${n.identifier}}}`;
        return '';
      }).join('');
      return {
        type: "run",
        value: {
          subtype: 'runCommand',
          raw,
          values: content
        }
      };
    }
  / "@run" runResult:_RunRHS {
      return {
        type: "run",
        value: runResult
      };
    }
  / value:InterpolatedStringLiteral {
    return {
      type: "string",
      value
    };
  }

DirectiveContent
  = "[" content:BracketContent "]" {
    return content;
  }

BracketContent
  = parts:(BracketText / BracketVariable)+ {
      return parts;
    }

BracketText
  = value:$(!([\\\]/.#{}] / '{{' / '$' / '\\') .)+ { // REVERTED: Restore original complex lookahead definition
      return helpers.createNode(NodeType.Text, { content: value }, location());
    }

BracketVariable
  = "{{" _ name:Identifier _ "}}" {
      return helpers.createVariableReferenceNode('text', { identifier: name }, location());
    }

QuotedString
  = '"' chars:DoubleQuotedChars '"' { return '"' + chars + '"'; }
  / "'" chars:SingleQuotedChars "'" { return "'" + chars + "'"; }
  / "`" chars:BracketText "`" { return "`" + chars + "`"; }

DoubleQuotedChars
  = chars:[^"]* { return chars.join(''); }

SingleQuotedChars
  = chars:[^']* { return chars.join(''); }

NestedBrackets
  = "[[" content:BracketContent "]]" {
    return content;
  }

MultilineContent
  = content:TextUnMultilineContent { return content; }

TextUnMultilineContent
  = content:([^\]]*) { 
    const text = content.join('');
    return [{ type: 'Text', content: text }];
  }

TextUntilNewline
  = chars:[^\n]+ { return chars.join(''); }

DirectiveOptions
  = _ options:DirectiveOption+ {
    return options.reduce((acc, opt) => ({ ...acc, ...opt }), {});
  }

DirectiveOption
  = _ key:Identifier _ "=" _ value:StringLiteral {
    return { [key]: value };
  }

SpecialPathChar
  = "." / "~"

Identifier
  = first:[a-zA-Z_] rest:[a-zA-Z0-9_]* {
    return first + rest.join('');
  }

StringLiteral
  = '"' chars:(!'"' char:. { return char; })* '"' { return chars.join(''); }
  / "'" chars:(!"'" char:. { return char; })* "'" { return chars.join(''); }
  / "`" chars:(!"`" char:. { return char; })* "`" { return chars.join(''); }

// New rule for multiline template literals
MultilineTemplateLiteral
  = "[[" content:(!"]]" char:. { return char; })* "]]" { 
      return content.join(''); 
    }

DataDirective
  = "data" _ id:Identifier schema:SchemaValidation? _ "=" _ value:DataValue HWS DirectiveEOL {
    return helpers.createDirective('data', {
      identifier: id,
      ...(schema ? { schema } : {}),
      source: value.type,
      ...(value.type === "embed" ? { embed: value.value } :
          value.type === "run" ? { run: value.value } :
          value.type === "call" ? { call: value.value } :
          { value: value.value })
    }, location());
  }

SchemaValidation
  = _ ":" _ schema:Identifier { return schema; }

DataValue
  = "@embed" embedResult:_EmbedRHS {
      return {
        type: "embed",
        embed: embedResult
      };
    }
  / "@run" runResult:_RunRHS {
      return {
        type: "run",
        run: runResult
      };
    }
  / "@call" _ api:Identifier "." method:Identifier _ content:DirectiveContent {
    return {
      type: "call",
      value: {
        kind: "call",
        api,
        method,
        path: content
      }
    };
  }
  / value:DataObjectLiteral {
    return {
      type: "literal",
      value
    };
  }
  / value:ArrayLiteral {
    return {
      type: "literal",
      value
    };
  }

DataObjectLiteral
  = "{{" _ props:ObjectProperties? _ "}}" {
    return props ? Object.fromEntries(props) : {};
  }
  / "{" _ props:ObjectProperties? _ "}" {
    return props ? Object.fromEntries(props) : {};
  }

ObjectProperties
  = first:ObjectProperty rest:(_ "," _ p:ObjectProperty { return p; })* {
    return [first, ...rest];
  }

ObjectProperty
  = key:PropertyKey _ ":" _ value:PropertyValue {
    return [key, value];
  }

PropertyKey
  = id:Identifier { return id; }
  / str:StringLiteral { return str; }

PropertyValue
  = InterpolatedStringLiteral
  / NumberLiteral
  / BooleanLiteral
  / NullLiteral
  / DataObjectLiteral
  / ArrayLiteral
  / varExpr:Variable { return varExpr; }
  / EmbedValue
  / RunValue
  / CallValue

EmbedValue
  = "@embed" _ content:DirectiveContent {
    return {
      kind: "embed",
      path: content
    };
  }

RunValue
  = "@run" _ content:DirectiveContent {
    return {
      kind: "run",
      command: content,
      ...(content.startsWith("$") ? { isReference: true } : {})
    };
  }

CallValue
  = "@call" _ api:Identifier "." method:Identifier _ content:DirectiveContent {
    return {
      kind: "call",
      api,
      method,
      path: content
    };
  }

NumberLiteral
  = "-"? digits:[0-9]+ decimal:("." [0-9]+)? {
    return parseFloat((text().startsWith("-") ? "-" : "") + digits.join('') + (decimal ? decimal[0] + decimal[1].join('') : ''));
  }

BooleanLiteral
  = "true" { return true; }
  / "false" { return false; }

NullLiteral
  = "null" { return null; }

ArrayLiteral
  = "[" _ items:ArrayItems? _ "]" {
    return items || [];
  }
  / "[[" _ items:ArrayItems? _ "]]" {
    return items || [];
  }

ArrayItems
  = first:PropertyValue rest:(_ "," _ v:PropertyValue { return v; })* trailingComma:(_ ",")? {
    return [first, ...rest];
  }

TextDirective
  = textAssignment / textBracketed

textAssignment
  = "text" _ id:Identifier _ "=" _ value:TextValue HWS DirectiveEOL {
    helpers.debug('TEXT', { type: 'assignment', identifier: id, valueSource: value.type });
    return helpers.createDirective('text', {
      identifier: id,
      source: value.type,
      values: value.values,
      ...(value.type === "embed" ? { embed: value.embed } :
          value.type === "run" ? { run: value.run } :
          value.type === "call" ? { call: value.value } :
          { values: value.values })
    }, location());
  }

textBracketed
  = "text" _ "[" content:BracketInterpolatableContent "]" HWS DirectiveEOL {
    helpers.debug('TEXT', { type: 'bracketed', content });
    return helpers.createDirective('text', {
      values: content
    }, location());
  }

TextValue
  = "@embed" embedResult:_EmbedRHS {
      return {
        type: "embed",
        embed: embedResult
      };
    }
  / "@run" runResult:_RunRHS {
      return {
        type: "run",
        run: runResult
      };
    }
  / "@call" _ api:Identifier "." method:Identifier _ content:DirectiveContent {
    return {
      type: "call",
      value: {
        kind: "call",
        api,
        method,
        path: content
      }
    };
  }
  / value:InterpolatedStringLiteral {
    return {
      type: "literal",
      values: value
    };
  }
  / value:InterpolatedMultilineTemplate {
    return {
      type: "literal",
      values: value
    };
  }

PathDirective
  = "path" __ id:Identifier __ "=" __ rhs:( // rhs captures the { identifier, path } object
      pathStr:PathStringLiteral { // Case 1: Path String
        // pathStr is an array of nodes
        const pathObject = helpers.validatePath(pathStr, { context: 'pathDirective' });
        // Return the directive data structure
        return { identifier: id, path: pathObject };
      }
  )
  (
    DirectiveEOL          /* newline + returns Newline node */
    / &EOF                  /* or just end of file, returns nothing */
  )
  { 
    // rhs now holds { identifier, path }, create the directive node
    return helpers.createDirective('path', rhs, location()); 
  }

VarDirective
  = "var" _ id:Identifier _ "=" _ value:VarValue DirectiveEOL {
    return helpers.createDirective('var', {
      identifier: id,
      value: {
        type: typeof value === 'string' ? 'string' :
              typeof value === 'number' ? 'number' :
              typeof value === 'boolean' ? 'boolean' :
              value === null ? 'null' :
              Array.isArray(value) ? 'array' :
              'object',
        value
      }
    }, location());
  }

VarValue
  = StringLiteral
  / NumberLiteral
  / BooleanLiteral
  / NullLiteral
  / DataObjectLiteral
  / ArrayLiteral

CodeFence
  = opener:BacktickSequence lang:CodeFenceLangID? "\n"
    content:(!(&{ return true; } closer:BacktickSequence &{
      return closer.length === opener.length;
    }) c:. { return c; })*
    closer:BacktickSequence !{
      return closer.length !== opener.length;
    } "\n"? {
      const rawContent = content.join('');
      const preserveCodeFences = options?.preserveCodeFences !== false;
      const finalContent = preserveCodeFences 
        ? opener.join('') + (lang ? lang : '') + '\n' + rawContent + (rawContent ? '' : '\n') + closer.join('')
        : rawContent.trimEnd();
      return helpers.createNode(NodeType.CodeFence, {
        language: lang || undefined,
        content: finalContent
      }, location());
    }

BacktickSequence
  = backticks:"`"+ &{
    return backticks.length >= 3 && backticks.length <= 5;
  } { 
    return backticks;
  }

CodeFenceLangID
  = chars:[^`\r\n]+ { return chars.join(''); }

PathValue
  = interpolatedArray:InterpolatedStringLiteral { 
      // Return the structured array directly
      return interpolatedArray; 
    }
  / variable:PathVar {
    // Return an array containing the single VariableReference node
    return [helpers.createVariableReferenceNode('path', { identifier: variable.identifier }, location())]; 
  }

// --- Path Component Tokens ---
PathSeparatorToken "Path Separator"
  = "/" { return helpers.createNode(NodeType.PathSeparator, { value: "/" }, location()); }

DotSeparatorToken "Dot Separator"
  = "." { return helpers.createNode(NodeType.DotSeparator, { value: "." }, location()); }

SectionMarkerToken "Section Marker"
  = [ \t]* "#" { return helpers.createNode(NodeType.SectionMarker, { value: "#" }, location()); }

// Brackets [...] Interpolation
BracketAllowedLiteralChar
  = !([\\\]/.#{}] / '{{' / '$' / '\\\\') . // Disallow \, /, ., #, {, }, {{, $, \\

BracketLiteralTextSegment
  = value:$(!([\\\]/.#{}] / '{{' / '$' / '\\' / [ \t]*'#') .)+ { // MODIFIED: Added lookahead for whitespace before #
      return helpers.createNode(NodeType.Text, { content: value }, location());
    }

// Define a single part that can appear inside brackets, guarded by lookahead
BracketPart
  = !']' part:(
        PathSeparatorToken
      / DotSeparatorToken
      / SectionMarkerToken
      / Variable
      / BracketLiteralTextSegment // Literal is the fallback
    ) { return part; }

BracketInterpolatableContent
  = parts:BracketPart+ {
      return parts;
    }

BracketInterpolatableContentOrEmpty
  = parts:BracketPart+ { return parts; }
  / ""                 { return []; }

// --- End Interpolation Rules ---

// --- Whitespace & EOF Rules ---

LineTerminator
  = '\n' / '\r\n' / '\r' / '\u2028' / '\u2029'

NewlineNode
  = term:LineTerminator &{ 
    const pos = offset();
    const isBeforeDirective = input.substr(pos).match(/^\s*@[a-z]/i);
    return isBeforeDirective;
  } {
    return helpers.createNode(NodeType.Newline, { content: term }, location());
  }

EOF
  = !.

EndOfLine
  = ws:[ \t\r]* term:LineTerminator &{ 
      const pos = offset();
      const isBeforeDirective = input.substr(pos).match(/^\s*@[a-z]/i);
      return isBeforeDirective;
    } { 
      return helpers.createNode(NodeType.Newline, { content: term }, location());
    }
  / ws:[ \t\r]* term:LineTerminator { 
      return helpers.createNode(NodeType.Newline, { content: term }, location());
    }
  / ws:[ \t\r]* &{ 
      const atEof = offset() === input.length;
      const nextChar = input[offset()];
      return atEof || (nextChar === '@' && helpers.isLogicalLineStart(input, offset())); 
    } { 
      return helpers.createNode(NodeType.Newline, { content: '\n' }, location());
    }

// --- End Whitespace & EOF Rules ---

// <<< START NEW RULES for Import Path Interpolation >>>
// Similar to BracketInterpolatableContent but specific chars disallowed


// <<< END NEW RULES >>>

// +++ START DECOMPOSED IMPORT RULES FOR LOGGING +++
_ImportKeyword
  = "import" { helpers.debug('Import Trace: Matched \"import\"'); return true; }

_ImportMandatoryWhitespace
  = __ { helpers.debug('Import Trace: Matched __'); return true; }

_ImportOpeningBracket
  = "[" { helpers.debug('Import Trace: Matched \"[\"'); return true; }

_ImportPathContent
  = pathParts:BracketInterpolatableContentOrEmpty { helpers.debug('Import Trace: Matched pathParts', `length=${pathParts.length}`); return pathParts; } // Return the matched parts

_ImportClosingBracket
  = "]" { helpers.debug('Import Trace: Matched \"\"]\"'); return true; }

_ImportEnd
  = ContentEOL { helpers.debug('Import Trace: Matched End'); return true; }
// +++ END DECOMPOSED IMPORT RULES +++

ImportPathOrBracketed
  = UnquotedImportPath
  / ('[' _ path:BracketInterpolatableContentOrEmpty _ ']') // MODIFIED: Use new unified rule

// Matches an unquoted path for import directives
UnquotedImportPath
  = chars:[^ \t\r\n\u200B\u200C\u200D]+ { return chars.join(''); }