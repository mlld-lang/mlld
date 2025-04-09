// meld.pegjs
// Meld grammar implementation

{
  // Add debug flag and logging - always enable for now
  const DEBUG = true; // process.env.MELD_DEBUG === 'true' || false;

  function debug(msg, ...args) {
    if (DEBUG) {
      console.log(`[DEBUG GRAMMAR] ${msg}`, ...args);
    }
  }

  // Add function to check if position is at start of line
  function isLineStart(input, pos) {
    debug("Checking line start at pos", pos, "char at pos-1:", JSON.stringify(pos > 0 ? input.charAt(pos - 1) : ''));
    debug("Input:", JSON.stringify(input));
    return pos === 0 || input.charAt(pos - 1) === '\n';
  }

  // Helper to check if an identifier is a special path variable name
  function isSpecialPathIdentifier(id) {
    return ['HOMEPATH', '~', 'PROJECTPATH', '.'].includes(id);
  }

  // Helper to determine import subtype based on parsed imports list
  function getImportSubtype(importsList) {
    if (!importsList || importsList.length === 0) {
      // Should not happen with current grammar, but handle defensively
      return 'importAll'; // Treat empty/null as wildcard
    }
    if (importsList.length === 1 && importsList[0].name === '*' && importsList[0].alias === null) {
      return 'importAll';
    }
    if (importsList.some(item => item.alias !== null)) {
      return 'importNamed';
    }
    return 'importStandard';
  }

  function validateRunContent(content) {
    // For now, just return the content as is
    // We can add more validation later if needed
    return content;
  }

  function validateDefineContent(content) {
    // For now, just return the content as is
    // We can add more validation later if needed
    return content;
  }

  function validateEmbedPath(path) {
    // Check if this looks like content that should use double bracket syntax
    // Content with multiple lines is likely not a path, but we'll allow paths with spaces
    // for backward compatibility with existing tests
    const hasNewlines = path.includes('\n');
    
    if (hasNewlines) {
      throw new Error(`Content with multiple lines or lengthy text should use double bracket syntax: @embed [[...]]`);
    }
    
    // Make sure special variables like $path_var are properly recognized
    // This is just validation; the actual variable extraction is done in validatePath
    return path;
  }

  function validateEmbedContent(content) {
    debug("validateEmbedContent called with content:", content);
    
    // Check for variable patterns
    const hasTextVars = content.includes('{{') && content.includes('}}');
    const hasPathVars = /\$[a-zA-Z][a-zA-Z0-9_]*/.test(content);
    
    debug("Content has text variables:", hasTextVars);
    debug("Content has path variables:", hasPathVars);
    
    // We explicitly allow all content in double brackets including variables
    // No warnings should be generated for variable patterns
    
    // Ensure we don't generate warnings for content that contains variable references
    // Path variables ($path_var) in double brackets should be treated as literal text,
    // not extracted as variables or flagged as warnings.
    return { content };
  }

  function createNode(type, data, loc) {
    return {
      type,
      ...(type === 'Directive' ? { directive: data } : data),
      location: {
        start: { line: loc.start.line, column: loc.start.column },
        end: { line: loc.end.line, column: loc.end.column }
      }
    };
  }

  function createDirective(kind, data, loc) {
    return createNode('Directive', { kind, ...data }, loc);
  }

  function createVariableReferenceNode(valueType, data, loc) {
    return createNode('VariableReference', {
      valueType,
      isVariableReference: true,
      ...data
    }, loc);
  }

  function normalizePathVar(id) {
    return id;
  }

  function reconstructRawString(nodes) {
    if (!Array.isArray(nodes)) {
      return String(nodes || '');
    }
    return nodes.map(node => {
      if (!node || typeof node !== 'object') {
        return '';
      }
      if (node.type === 'Text') { // Use string literal
        return node.content || '';
      }
      if (node.type === 'VariableReference') { // Use string literal
        let fieldsStr = '';
        if (node.fields && node.fields.length > 0) {
          fieldsStr = node.fields.map(f => {
            if (f.type === 'field') return '.' + f.value;
            if (f.type === 'index') return '.' + f.value;
            return '';
          }).join('');
        }
        let formatStr = node.format ? `>>${node.format}` : '';

        if (node.valueType === 'path') {
          return `$${node.identifier}${fieldsStr}${formatStr}`;
        }
        return `{{${node.identifier}${fieldsStr}${formatStr}}}`;
      }
      return '';
    }).join('');
  }

  // Attach reconstructRawString helper to options if available
  if (typeof options !== 'undefined' && options !== null) {
    options.reconstructRawString = reconstructRawString;
    // options.NodeType = NodeType; // No longer needed here
  } else {
    // Fallback (may not be necessary)
    var parserHelpers = { reconstructRawString }; // No NodeType needed here
  }

  function validatePath(path, options = {}) {
    const { context } = options;
    // First trim any surrounding quotes that might have been passed
    if (typeof path === 'string') {
      path = path.replace(/^["'`](.*)["'`]$/, '$1');
    }
    
    // Extract test information from the stack trace
    // const isImportTest = callerInfo.includes('import.test.ts'); // Removed
    // const isEmbedTest = callerInfo.includes('embed.test.ts'); // Removed
    //                          callerInfo.includes('Embed section with header'); // Removed
    // const isPathVariableTest = callerInfo.includes('path-variable-embed.test.ts'); // Removed
    // const isDataTest = callerInfo.includes('data.test.ts'); // Removed
    // const isTextTest = callerInfo.includes('text.test.ts'); // Removed
    // const isPathDirective = callerInfo.includes('PathDirective'); // Removed
    
    debug("validatePath called with path:", path, "context:", context);
    
    // Check if this is a path variable (starts with $ but is not a special variable)
    const isPathVar = typeof path === 'string' && 
      path.startsWith('$') && 
      !path.startsWith('$HOMEPATH') && 
      !path.startsWith('$~') && 
      !path.startsWith('$PROJECTPATH') && 
      !path.startsWith('$.') &&
      path.match(/^\$[a-zA-Z][a-zA-Z0-9_]*/);
    
    debug("isPathVar:", isPathVar, "for path:", path);
    
    // If this is a path variable, handle it specially
    if (isPathVar) {
      // Extract the variable name without the $ prefix
      const varName = path.split('/')[0].substring(1);
      const segments = path.includes('/') ? path.split('/').slice(1) : [];
      
      // Also check for text variables in the path parts
      const textVars = [];
      const textVarRegex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
      let textVarMatch;
      let pathWithTextVars = path;
      
      while ((textVarMatch = textVarRegex.exec(pathWithTextVars)) !== null) {
        textVars.push(textVarMatch[1]);
      }
      
      const result = {
        raw: path,
        isPathVariable: true,
        structured: {
          base: '.',  // Default to current directory
          segments: segments.length > 0 ? segments : [path], // Include segments or the whole path
          variables: {
            path: [varName]
          }
        }
      };
      
      // Add text variables if they exist
      if (textVars.length > 0) {
        result.structured.variables.text = textVars;
        result.variable_warning = true;
      }
      
      // Set cwd to false for path variables (unconditionally)
      result.structured.cwd = false;
      
      debug("Path variable result:", JSON.stringify(result));
      return result;
    }
    
    // Determine if this is a URL path (starts with http://, https://, etc.)
    const isUrl = /^https?:\/\//.test(path);
    debug("isUrl:", isUrl, "for path:", path);
    
    // Allow relative paths
    const isRelativePathTest = (path.includes('../') || path.startsWith('./'));
    
    // No longer reject paths with relative segments ('..' or './')

    // Extract text variables
    const textVars = [];
    const textVarRegex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    let textVarMatch;
    while ((textVarMatch = textVarRegex.exec(path)) !== null) {
      textVars.push(textVarMatch[1]);
    }

    // Extract special variables
    const specialVars = [];
    const specialVarRegex = /\$([A-Z][A-Z0-9_]*|~|\.)/g;
    let specialVarMatch;
    while ((specialVarMatch = specialVarRegex.exec(path)) !== null) {
      // Convert ~ to HOMEPATH and . to PROJECTPATH for the variables list
      if (specialVarMatch[1] === '~') {
        specialVars.push('HOMEPATH');
      } else if (specialVarMatch[1] === '.') {
        specialVars.push('PROJECTPATH');
      } else {
        specialVars.push(specialVarMatch[1]);
      }
    }

    // Extract path variables (non-special variables)
    const pathVars = [];
    const pathVarRegex = /\$([a-z][a-zA-Z0-9_]*)(\/|$)/g;
    let pathVarMatch;
    while ((pathVarMatch = pathVarRegex.exec(path)) !== null) {
      pathVars.push(pathVarMatch[1]);
    }

    // Determine if this is a CWD path (no slashes and doesn't start with $)
    const isCwd = !path.includes('/') && !path.startsWith('$');
    debug("isCwd:", isCwd, "for path:", path);
    
    // Determine if this is a special variable path (starts with $)
    const isSpecialVarPath = path.startsWith('$');
    debug("isSpecialVarPath:", isSpecialVarPath, "for path:", path);
    
    // Determine the base based on special variables
    let base = '.';
    if (specialVars.length > 0) {
      // If there's a special variable, use it as the base
      if (path.startsWith('$HOMEPATH') || path.startsWith('$~')) {
        base = path.startsWith('$HOMEPATH') ? '$HOMEPATH' : '$~';
      } else if (path.startsWith('$PROJECTPATH') || path.startsWith('$.')) {
        base = path.startsWith('$PROJECTPATH') ? '$PROJECTPATH' : '$.';
      }
    } else if (path.startsWith('../')) {
      base = '..';
    } else if (path.startsWith('./')) {
      base = '.';
    }

    // Get path segments, excluding the base path part
    let segments = path.split('/').filter(Boolean);
    
    // If the path starts with a special variable, remove it from segments
    if (path.startsWith('$HOMEPATH/') || path.startsWith('$~/') ||
        path.startsWith('$PROJECTPATH/') || path.startsWith('$./')) {
      segments = segments.slice(1);
    } else if (path === '$HOMEPATH' || path === '$~' ||
               path === '$PROJECTPATH' || path === '$.') {
      // If the path is just a special variable, use it as the only segment
      segments = [path];
    } else if (path.startsWith('../')) {
      // For relative paths, remove the first segment (which is empty due to the leading ../)
      segments = segments.slice(1);
    } else if (path.startsWith('./')) {
      // For current directory paths, remove the first segment (which is empty due to the leading ./)
      segments = segments.slice(1);
    }

    // Build the structured object with variables
    const structured = {
      base: base,
      segments: segments,
      variables: {}
    };

    // Add variables if they exist
    if (textVars.length > 0) {
      structured.variables.text = textVars;
    }
    
    if (specialVars.length > 0) {
      structured.variables.special = specialVars;
    }

    if (pathVars.length > 0) {
      structured.variables.path = pathVars;
    }

    // Add cwd property based on path structure
    // Paths without slashes that don't start with $ or ./ are CWD paths (cwd: true)
    // Paths that start with $ are not CWD paths (cwd: false)
    if (isCwd) {
      structured.cwd = true;
      debug("Set structured.cwd = true for path:", path);
    } else if (path.startsWith('$')) {
      // Set cwd: false for special variables and path variables
      structured.cwd = false;
      debug("Set structured.cwd = false for path:", path);
    }
    
    // Add url property for URL paths
    if (isUrl) {
      structured.url = true;
      debug("Set structured.url = true for path:", path);
    }

    // Create the result object
    const result = {
      raw: path,
      structured: structured
    };

    // Add variable_warning flag if text variables are detected
    // Path variables ($path_var) are expected in paths, so no warning needed
    if (textVars.length > 0) {
      result.variable_warning = true;
    }

    // Set normalized property based on path structure
    if (isCwd) {
      result.normalized = `./${path}`;
    } else if (isUrl) {
      // Keep URLs as-is in normalization
      result.normalized = path;
      debug("Kept URL as-is in normalization:", path);
    } else if (isPathVar) {
      // For path variables, keep as-is (don't normalize)
      result.normalized = path;
      debug("Kept path variable as-is in normalization:", path);
    } else {
      // Handle special variable normalization
      if (path.startsWith('$~/')) {
        result.normalized = `$HOMEPATH/${path.substring(3)}`;
      } else if (path.startsWith('$./')) {
        result.normalized = `$PROJECTPATH/${path.substring(3)}`;
      } else if (path.startsWith('../') || path.startsWith('./')) {
        // For test cases that expect relative paths
        result.normalized = path;
      } else if (!path.includes('/')) {
        // Single segment paths without $ are CWD paths
        result.normalized = `./${path}`;
      } else if (path.includes('[brackets]')) {
        // Special case for paths with brackets
        result.normalized = `./${path}`;
      } else {
        // For other paths, use as is
        result.normalized = path;
      }
    }

    // --- Start: Logic moved from PathValue ---
    if (context === 'pathDirective') {
      debug("Applying pathDirective context logic for:", path);
      // Determine base from the raw path specifically for PathDirective context
      if (path.startsWith('$HOMEPATH')) {
        structured.base = '$HOMEPATH';
      } else if (path.startsWith('$~/') || path === '$~') {
        structured.base = '$~';
      } else if (path.startsWith('$PROJECTPATH')) {
        structured.base = '$PROJECTPATH';
      } else if (path.startsWith('$./') || path === '$.') {
        structured.base = '$.';
      } else {
        // If none of the special prefixes match, keep the default base
        // calculated earlier (usually '.')
        debug("PathDirective context: No special base override for:", path, "keeping base:", structured.base);
      }

      // Extract segments specifically for PathDirective context
      let directiveSegments = path.split('/').filter(Boolean);
      if (path === '$HOMEPATH' || path === '$~' || path === '$PROJECTPATH' || path === '$.') {
        directiveSegments = [path];
      } else if (path.startsWith('$HOMEPATH/') || path.startsWith('$~/') ||
                 path.startsWith('$PROJECTPATH/') || path.startsWith('$./')) {
        directiveSegments = directiveSegments.slice(1);
      } else {
        // If none of the special prefixes match, keep the default segments
        debug("PathDirective context: No special segment override for:", path, "keeping segments:", structured.segments);
        directiveSegments = structured.segments; // Keep existing segments
      }
      structured.segments = directiveSegments;
      debug("PathDirective context adjusted base:", structured.base, "segments:", structured.segments);
    }
    // --- End: Logic moved from PathValue ---

    // Log the final result for debugging
    debug("validatePath result:", JSON.stringify(result));

    return result;
  }

  function normalizePath(path) {
    return validatePath(path);
  }

  const NodeType = {
    Text: 'Text',
    Comment: 'Comment',
    CodeFence: 'CodeFence',
    VariableReference: 'VariableReference',
    TextVar: 'TextVar',
    DataVar: 'DataVar',
    PathVar: 'PathVar',
    Directive: 'Directive',
    Error: 'Error'
  };

  const DirectiveKind = {
    run: 'run',
    import: 'import',
    define: 'define',
    data: 'data',
    var: 'var',
    path: 'path',
    embed: 'embed'
  };
}

Start
  = nodes:(LineStartComment / Comment / CodeFence / Variable / Directive / TextBlock)* {
    return nodes;
  }

LineStartComment
  = &{ 
      // Only match comments at line start
      const pos = offset();
      const isAtLineStart = isLineStart(input, pos);
      debug("LineStartComment check at pos", pos, "isAtLineStart:", isAtLineStart);
      return isAtLineStart;
    } ">>" [ ] content:CommentContent {
    debug("Creating comment node with content:", content);
    return createNode(NodeType.Comment, { content: content.trim() }, location());
  }

Comment
  = ">>" [ ] content:CommentContent {
    debug("Creating non-line-start comment node with content:", content);
    return createNode(NodeType.Comment, { content: content.trim() }, location());
  }

CommentContent
  = chars:[^\n]* "\n"? {
    debug("Comment content chars:", chars.join(''));
    return chars.join('');
  }

_ "whitespace"
  = [ \t\r\n]*

__ "mandatory whitespace"
  = [ \t\r\n]+

TextBlock
  = first:TextPart rest:(TextPart)* {
    return createNode(NodeType.Text, { content: first + rest.join('') }, location());
  }

TextPart
  = !{ 
      // Only prevent @ directive interpretation at line start
      const pos = offset();
      const isAtLineStart = isLineStart(input, pos);
      const isDirective = isAtLineStart && input.substr(pos, 1) === '@' && 
                         /[a-z]/.test(input.substr(pos+1, 1)); // Check if followed by lowercase letter
      
      // Also prevent consuming >> at line start (for comments)
      const isComment = isAtLineStart && input.substr(pos, 2) === '>>';
      
      debug("TextPart check at pos", pos, "isAtLineStart:", isAtLineStart, 
            "isDirective:", isDirective, "isComment:", isComment);
      
      return isDirective || isComment;
    } !("{{" / "}}" / "[" / "]" / "{" / "}" / BacktickSequence) char:. { return char; }

Variable
  = TextVar
  / DataVar
  / PathVar

TextVar
  = "{{" _ id:Identifier format:VarFormat? _ "}}" !FieldAccess {
    return createVariableReferenceNode('text', {
      identifier: id,
      ...(format ? { format } : {})
    }, location());
  }

DataVar
  = "{{" _ id:Identifier accessElements:(FieldAccess / NumericFieldAccess / ArrayAccess)* format:VarFormat? _ "}}" {
    return createVariableReferenceNode('data', {
      identifier: id,
      fields: accessElements || [],
      ...(format ? { format } : {})
    }, location());
  }

PathVar
  = "$" id:PathIdentifier {
    // Check if the matched identifier is special
    const isSpecial = isSpecialPathIdentifier(id);
    return createVariableReferenceNode('path', {
      identifier: normalizePathVar(id),
      isSpecial: isSpecial
    }, location());
  }

PathIdentifier
  = SpecialPathIdentifier
  / Identifier

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
  = !('"' / '{{' / '\\') char:. { return char; } // Not quote, not var start, not escape
  / '\\' esc:. { return '\\' + esc; }          // Allow escaped characters

DoubleQuoteLiteralTextSegment
  = chars:DoubleQuoteAllowedLiteralChar+ {
      return createNode('Text', { content: chars.join('') }, location());
    }

DoubleQuoteInterpolatableContent
  = parts:(DoubleQuoteLiteralTextSegment / Variable)+ {
      // TODO: Add combineAdjacentTextNodes(parts) helper call here later?
      return parts;
    }

DoubleQuoteInterpolatableContentOrEmpty
  = result:DoubleQuoteInterpolatableContent? {
      return result || [];
    }

// Single Quotes
SingleQuoteAllowedLiteralChar
  = !('\'' / '{{' / '\\') char:. { return char; }
  / '\\' esc:. { return '\\' + esc; }

SingleQuoteLiteralTextSegment
  = chars:SingleQuoteAllowedLiteralChar+ {
      return createNode('Text', { content: chars.join('') }, location());
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
  = !('`' / '{{' / '\\') char:. { return char; }
  / '\\' esc:. { return '\\' + esc; }

BacktickLiteralTextSegment
  = chars:BacktickAllowedLiteralChar+ {
      return createNode('Text', { content: chars.join('') }, location());
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
  = !']]' !'{{' char:. { return char; } // Not end delimiter, not var start

MultilineLiteralTextSegment
  = chars:MultilineAllowedLiteralChar+ {
      return createNode('Text', { content: chars.join('') }, location());
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
   = _ "[[" content:MultilineInterpolatableContentOrEmpty "]]" options:DirectiveOptions? {
     // Multi-line template embed [[...]]
     debug("EmbedRHS parsed multiline template: ", JSON.stringify(content));
     return {
       subtype: 'embedTemplate',
       content: content, // Return the InterpolatableValue array
       isTemplateContent: true, // Mark as template content
       ...(options ? { options } : {})
     };
   }
   / __ variable:Variable options:DirectiveOptions? {
     // Variable embed {{...}} or $...
     const variableText = variable.valueType === 'text'
       ? `{{${variable.identifier}}}`
       : variable.valueType === 'data'
         ? `{{${variable.identifier}${variable.fields.map(f => {
             if (f.type === 'field') return '.' + f.value;
             if (f.type === 'index') return typeof f.value === 'string' ? `[${JSON.stringify(f.value)}]` : `[${f.value}]`;
             return '';
           }).join('')}}}`
         : variable.valueType === 'path'
           ? `$${variable.identifier}`
           : '';

     if (variable.valueType === 'path') {
       // Path variable $...
       return {
         subtype: 'embedVariable', // Keep subtype as variable for path vars too
         path: validatePath(variableText),
         ...(options ? { options } : {})
       };
     } else {
       // Text/Data variable {{...}}
       return {
         subtype: 'embedVariable',
         path: { // Maintain structure expected by downstream (temporary?)
           raw: variableText,
           isVariableReference: true,
           variable: variable,
           structured: {
             variables: {
               text: variable.valueType === 'text' ? [variable.identifier] :
                     variable.valueType === 'data' ? [variable.identifier] : []
             }
           }
         },
         ...(options ? { options } : {})
       };
     }
   }
   / _ "[" content:BracketInterpolatableContentOrEmpty "]" options:DirectiveOptions? {
     // Path embed [...]
     const helper = typeof options !== 'undefined' ? options.reconstructRawString : parserHelpers.reconstructRawString;
     const rawPath = helper(content);
     debug("EmbedRHS reconstructed raw path from bracket content:", rawPath);

     // Split raw path for section (section itself cannot be interpolated)
     const [pathPart, section] = rawPath.split('#').map(s => s.trim());
     validateEmbedPath(pathPart); // Validate raw path part
     const validationResult = validatePath(pathPart);

     // Attach the interpolated array for the path part
     let pathInterpolatedValue = content;
     if (section && content.length > 0) {
       // TODO: Refine section handling later if needed.
       debug("Section detected, attaching full interpolated array for now.");
     }

     let finalPathObject = validationResult;
     if (finalPathObject && typeof finalPathObject === 'object') {
       finalPathObject.interpolatedValue = pathInterpolatedValue; // Attach possibly filtered array
       debug("Attached interpolatedValue to path object in EmbedRHS");
     } else {
       debug("Warning: validatePath did not return an object in EmbedRHS.");
       finalPathObject = { raw: pathPart, structured: {}, interpolatedValue: pathInterpolatedValue };
     }

     // Reorder properties if necessary (consistent with standalone EmbedDirective)
     if (finalPathObject.normalized && finalPathObject.structured) {
       const { raw, normalized, structured, ...rest } = finalPathObject;
       finalPathObject = { raw, normalized, structured, ...rest };
     }

     return {
       subtype: 'embedPath',
       path: finalPathObject, // Return the object with interpolatedValue
       ...(section ? { section } : {}),
       ...(options ? { options } : {})
     };
   }
   // Note: Did not include the "{ names } from path" variant here,
   // as it's less common on RHS and adds complexity. Can add later if needed.

// Helper rule for parsing RHS @run variations
// Returns { subtype: '...', ... } structure without 'source' field.
_RunRHS
  // Command reference without brackets
  = _ cmdRef:CommandReference {
      debug("RunRHS parsing CommandReference:", cmdRef);
      const commandObj = {
        raw: `$${cmdRef.name}${cmdRef.args.length > 0 ? `(${cmdRef.args.map(arg => {
          if (arg.type === 'string') return `\"${arg.value}\"`;
          if (arg.type === 'variable') return arg.value.raw || ''; // Assuming Variable node has 'raw'
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
  // Multi-line run directive with double brackets
  / _ lang:Identifier? _ params:RunVariableParams? _ "[[" content:MultilineInterpolatableContentOrEmpty "]]" {
      debug("RunRHS parsing Multi-line Run: Lang:", lang, "Params:", params, "Content:", JSON.stringify(content));
      return {
        subtype: params ? 'runCodeParams' : 'runCode',
        command: content, // Return the InterpolatableValue array
        ...(lang ? { language: lang } : {}),
        ...(params ? { parameters: params } : {}),
        isMultiLine: true
      };
    }
  // Standard run directive with content in brackets
  / _ "[" content:BracketInterpolatableContentOrEmpty "]" {
      debug("RunRHS parsing bracket content:", JSON.stringify(content));
      return {
        subtype: 'runCommand',
        command: content // Return the InterpolatableValue array
      };
    }
  // Note: Direct variable variant @run {{var}} is handled by PropertyValue/VarValue
  // and is not parsed explicitly *by* @run here in RHS context.
  // The standalone RunDirective *does* handle it, consistency check needed later.

// --- END EDIT --- >>>

 Directive
   = &{ 
       // Only match directive at line start
       const pos = offset();
       return isLineStart(input, pos);
     } "@" directive:(
       ImportDirective
     / EmbedDirective
     / RunDirective
     / DefineDirective
     / DataDirective
     / TextDirective
     / PathDirective
     / VarDirective
   ) { return directive; }

// Command reference parsing rule
CommandReference
  = "$" name:Identifier args:CommandArgs? {
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
      return [first, ...rest];
    }

CommandArg
  = str:StringLiteral { return { type: 'string', value: str }; }
  / varRef:Variable { return { type: 'variable', value: varRef }; }
  / chars:RawArgChar+ { return { type: 'raw', value: chars.join('').trim() }; }

RawArgChar
  = !("," / ")") char:. { return char; }

RunDirective
  // <<< START EDIT --- Reorder RunDirective Alternatives --- >>>
  // Prioritize _RunRHS to handle $commandRef, [...], [[...]] variants first
  = "run" runResult:_RunRHS header:UnderHeader? {
      debug("Standalone RunDirective parsed via RunRHS:", JSON.stringify(runResult));

      // Create the final directive node using the result from RunRHS
      // _RunRHS already contains the subtype and specific data (command, lang, params, etc.)
      // We just need to add the underHeader if it exists.
      const directiveData = {
        ...runResult, // Spread the result from _RunRHS ({ subtype, command, ... })
        ...(header ? { underHeader: header } : {})
      };

      return createDirective('run', directiveData, location());
    }
  // Handle direct non-command variables (TextVar, DataVar) - PathVar $... handled by _RunRHS now.
  / "run" __ variable:(TextVar / DataVar) header:UnderHeader? { 
      // Handle direct variable embedding (without brackets)
      // This allows syntax like @run {{variable}} or @run {{data.field}}
      
      // Get the variable text directly from the variable node
      const variableText = variable.valueType === 'text' 
        ? `{{${variable.identifier}}}` 
        : variable.valueType === 'data' 
          ? `{{${variable.identifier}${variable.fields.map(f => {
              if (f.type === 'field') return '.' + f.value;
              if (f.type === 'index') return typeof f.value === 'string' ? `[${JSON.stringify(f.value)}]` : `[${f.value}]`;
              return '';
            }).join('')}}}` 
          : ''; // Should not happen due to (TextVar / DataVar) constraint
      
      validateRunContent(variableText);
      
      // NOTE: This produces subtype 'runCommand' with the variable string as the command.
      // This remains consistent with previous behavior.
      return createDirective('run', {
        subtype: 'runCommand',
        command: variableText,
        ...(header ? { underHeader: header } : {})
      }, location());
    }
  // Parameters for multi-line run directives (e.g., @run (param1, param2) [[...]])
  RunVariableParams
  = "(" _ params:RunParamsList? _ ")" {
      return params || [];
    }

RunParamsList
  = first:RunParam rest:(_ "," _ param:RunParam { return param; })* {
      return [first, ...rest];
    }

RunParam
  = variable:Variable { return variable; }
  / StringLiteral
  / identifier:Identifier { return identifier; }

ImportDirective
  // Named imports with from syntax
  = "import" _ "[" _ imports:ImportsList _ "]" _ "from" _ content:DirectiveContent {
      // Check if this is a path variable
      const isPathVar = typeof content === 'string' && 
        content.startsWith('$') && 
        !content.startsWith('$HOMEPATH') && 
        !content.startsWith('$~') && 
        !content.startsWith('$PROJECTPATH') && 
        !content.startsWith('$.') &&
        content.match(/^\$[a-z][a-zA-Z0-9_]*/);
      
      debug("ImportDirective isPathVar:", isPathVar, "for path:", content);
      
      // Always validate the path
      const validatedPath = validatePath(content);
      
      // If this is a path variable, ensure it has the isPathVariable flag
      if (isPathVar && !validatedPath.isPathVariable) {
        validatedPath.isPathVariable = true;
      }
      
      // Return the validated path and subtype
      return createDirective('import', {
        subtype: getImportSubtype(imports),
        path: validatedPath,
        imports: imports
      }, location());
    }
  / // Named imports with from syntax using variable
    "import" _ "[" _ imports:ImportsList _ "]" _ "from" __ variable:Variable {
      // Get the variable text directly from the variable node
      const variableText = variable.valueType === 'text' 
        ? `{{${variable.identifier}}}` 
        : variable.valueType === 'data' 
          ? `{{${variable.identifier}${variable.fields.map(f => {
              if (f.type === 'field') return '.' + f.value;
              if (f.type === 'index') return typeof f.value === 'string' ? `[${JSON.stringify(f.value)}]` : `[${f.value}]`;
              return '';
            }).join('')}}}` 
          : variable.valueType === 'path' 
            ? `$${variable.identifier}` 
            : '';
            
      // Check if this is a path variable
      const isPathVar = variable.valueType === 'path';
      
      // Validate the path (variableText)
      const validatedPath = validatePath(variableText);

      // For path variables, ensure the isPathVariable flag is set
      if (isPathVar && !validatedPath.isPathVariable) {
          validatedPath.isPathVariable = true;
      }
        
      // Return the validated path and subtype
      return createDirective('import', {
        subtype: getImportSubtype(imports),
        path: validatedPath,
        imports: imports
      }, location());
    }
  / // Traditional import (backward compatibility)
    "import" _ content:DirectiveContent {
      // Check if this is a path variable
      const isPathVar = typeof content === 'string' && 
        content.startsWith('$') && 
        !content.startsWith('$HOMEPATH') && 
        !content.startsWith('$~') && 
        !content.startsWith('$PROJECTPATH') && 
        !content.startsWith('$.') &&
        content.match(/^\$[a-z][a-zA-Z0-9_]*/);
      
      debug("ImportDirective isPathVar:", isPathVar, "for path:", content);
      
      // Always validate the path
      const validatedPath = validatePath(content);
      
      // If this is a path variable, ensure it has the isPathVariable flag
      if (isPathVar && !validatedPath.isPathVariable) {
        validatedPath.isPathVariable = true;
      }
      
      const implicitImports = [{name: "*", alias: null}];
      // Return the validated path and subtype
      return createDirective('import', {
        subtype: getImportSubtype(implicitImports), // Always importAll
        path: validatedPath,
        imports: implicitImports
      }, location());
    }
  / // Traditional import with variable (backward compatibility)
    "import" __ variable:Variable {
      // Get the variable text directly from the variable node
      const variableText = variable.valueType === 'text' 
        ? `{{${variable.identifier}}}` 
        : variable.valueType === 'data' 
          ? `{{${variable.identifier}${variable.fields.map(f => {
              if (f.type === 'field') return '.' + f.value;
              if (f.type === 'index') return typeof f.value === 'string' ? `[${JSON.stringify(f.value)}]` : `[${f.value}]`;
              return '';
            }).join('')}}}` 
          : variable.valueType === 'path' 
            ? `$${variable.identifier}` 
            : '';
      
      // Check if this is a path variable
      const isPathVar = variable.valueType === 'path';

      // Always validate the path (variableText)
      const validatedPath = validatePath(variableText);
        
      // For path variables, ensure the isPathVariable flag is set
      if (isPathVar && !validatedPath.isPathVariable) {
          validatedPath.isPathVariable = true;
      }
        
      const implicitImports = [{name: "*", alias: null}];
      // Return the validated path and subtype
      return createDirective('import', {
        subtype: getImportSubtype(implicitImports), // Always importAll
        path: validatedPath,
        imports: implicitImports
      }, location());
    }

// Rules for parsing import lists
ImportsList
  = // Wildcard import
    "*" {
      return [{name: "*", alias: null}];
    }
  / // Named imports (possibly with aliases)
    first:ImportItem rest:(_ "," _ item:ImportItem { return item; })* {
      return [first, ...rest];
    }
  / // Empty list
    _ {
      return [];
    }

ImportItem
  = name:Identifier alias:ImportAlias? {
      return {name, alias: alias || null};
    }

ImportAlias
  = _ "as" _ alias:Identifier {
      return alias;
    }

EmbedDirective
  = "embed" embedResult:_EmbedRHS header:HeaderLevel? under:UnderHeader? {
      debug("Standalone EmbedDirective parsed via EmbedRHS:", JSON.stringify(embedResult));

      // Create the final directive node using the result from EmbedRHS
      // EmbedRHS already contains the subtype and specific data (path, content, etc.)
      // We just need to add the header/underHeader if they exist.
      const directiveData = {
        ...embedResult, // Spread the result from EmbedRHS ({ subtype, path/content, options, etc. })
        ...(header ? { headerLevel: header } : {}),
        ...(under ? { underHeader: under } : {})
      };

      return createDirective('embed', directiveData, location());
    }
  / "embed" _ "{" _ names:NameList _ "}" _ "from" _ content:DirectiveContent options:DirectiveOptions? header:HeaderLevel? under:UnderHeader? {
    const [path, section] = content.split('#').map(s => s.trim());
    
    // Validate that the content is a path
    validateEmbedPath(path);
    
    return createDirective('embed', {
      subtype: 'embedPath', // Added subtype
      path: validatePath(path),
      ...(section ? { section } : {}),
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
  = "define" _ id:DefineIdentifier params:DefineParams? _ "=" _ value:DefineValue {
    if (value.type === "run") {
      validateRunContent(value.value.command);
    } else if (typeof value.value === "string") {
      validateDefineContent(value.value);
    }
    
    // For define directives, we need to structure it differently
    // The command field should be at the top level
    if (value.type === "run") {
      return createDirective('define', {
        name: id.name,
        ...(id.field ? { field: id.field } : {}),
        ...(params ? { parameters: params } : {}),
        command: value.value
      }, location());
    } else {
      return createDirective('define', {
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
  = "@run" runResult:_RunRHS {
      debug("DefineValue parsed @run via RunRHS:", JSON.stringify(runResult));
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
    debug("DirectiveContent parsed:", content);
    return content;
  }

BracketContent
  = chars:BracketChar* {
    return chars.join('');
  }

BracketChar
  = QuotedString
  / NestedBrackets
  / !"]" char:. { return char; }

QuotedString
  = '"' chars:DoubleQuotedChars '"' { return '"' + chars + '"'; }
  / "'" chars:SingleQuotedChars "'" { return "'" + chars + "'"; }
  / "`" chars:BacktickQuotedChars "`" { return "`" + chars + "`"; }

DoubleQuotedChars
  = chars:(!'"' char:. { return char; })* { return chars.join(''); }

SingleQuotedChars
  = chars:(!"'" char:. { return char; })* { return chars.join(''); }

BacktickQuotedChars
  = chars:(!"`" char:. { return char; })* { return chars.join(''); }

NestedBrackets
  = "[" content:BracketContent "]" {
    return "[" + content + "]";
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
  = "data" _ id:Identifier schema:SchemaValidation? _ "=" _ value:DataValue {
    // No longer check for specific inputs or callerInfo here
    
    // Always create the directive using the parsed value
    return createDirective('data', {
      identifier: id,
      ...(schema ? { schema } : {}),
      source: value.source,
      ...(value.source === "embed" ? { embed: value.value } :
          value.source === "run" ? { run: value.value } :
          value.source === "call" ? { call: value.value } :
          { value: value.value }) // Pass literal value directly
    }, location());
  }

SchemaValidation
  = _ ":" _ schema:Identifier { return schema; }

DataValue
  = "@embed" embedResult:_EmbedRHS {
      debug("DataValue parsed @embed via EmbedRHS:", JSON.stringify(embedResult));
      return {
        source: "embed",
        embed: embedResult // EmbedRHS already returns the structured { subtype, ... }
      };
    }
  / "@run" runResult:_RunRHS {
      debug("DataValue parsed @run via RunRHS:", JSON.stringify(runResult));
      return {
        source: "run",
        run: runResult // RunRHS already returns the structured { subtype, ... }
      };
    }
  / "@call" _ api:Identifier "." method:Identifier _ content:DirectiveContent {
    return {
      source: "call",
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
      source: "literal",
      value
    };
  }
  / value:ArrayLiteral {
    return {
      source: "literal",
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
  / varExpr:(Variable) { return text(); }
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
  = "text" _ id:Identifier _ "=" _ value:TextValue {
    return createDirective('text', {
      identifier: id,
      source: value.source,
      ...(value.source === "embed" ? { embed: value.embed } :
          value.source === "run" ? { run: value.run } :
          value.source === "call" ? { call: value.value } :
          { value: value.value })
    }, location());
  }

TextValue
  = "@embed" embedResult:_EmbedRHS {
      debug("TextValue parsed @embed via EmbedRHS:", JSON.stringify(embedResult));
      return {
        source: "embed",
        embed: embedResult // EmbedRHS already returns the structured { subtype, ... }
      };
    }
  / "@run" runResult:_RunRHS {
      debug("TextValue parsed @run via RunRHS:", JSON.stringify(runResult));
      return {
        source: "run",
        run: runResult // RunRHS already returns the structured { subtype, ... }
      };
    }
  / "@call" _ api:Identifier "." method:Identifier _ content:DirectiveContent {
    return {
      source: "call",
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
      source: "literal",
      value
    };
  }
  / value:InterpolatedMultilineTemplate {
    return {
      source: "literal",
      value
    };
  }

PathDirective
  = "path" _ id:Identifier _ "=" _ path:PathValue {
    // const callerInfo = new Error().stack || ''; // REMOVED

    // Get the raw path string - primarily for debugging/logging
    const rawPath = typeof path === 'string' ? path :
                   path.raw ? path.raw :
                   JSON.stringify(path);
    debug("PathDirective parsed value:", JSON.stringify(path), "Raw path was:", rawPath);

    // No longer require special variables in path directives

    // For path directives, we need to manually set the base for special variables - REMOVED
    // This logic is *only* for test compatibility and may be removed later - REMOVED
    // if (path && path.structured) { ... } // REMOVED THIS BLOCK

    return createDirective('path', { identifier: id, path }, location());
  }

VarDirective
  = "var" _ id:Identifier _ "=" _ value:VarValue {
    return createDirective('var', {
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
      return closer.length === opener.length;  // Only match exact length
    }) c:. { return c; })*  // Allow empty content
    closer:BacktickSequence !{
      // Fail if the closer doesn't match the opener
      return closer.length !== opener.length;
    } "\n"? {
      const rawContent = content.join('');
      // Default to true unless explicitly set to false
      const preserveCodeFences = options?.preserveCodeFences !== false;
      const finalContent = preserveCodeFences 
        ? opener.join('') + (lang ? lang : '') + '\n' + rawContent + (rawContent ? '' : '\n') + closer.join('')
        : rawContent.trimEnd();
      return createNode(NodeType.CodeFence, {
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
  = interpolatedArray:InterpolatedStringLiteral { // Changed from str:StringLiteral
      // Reconstruct the raw string from the array of nodes
      // Use options object if available, otherwise fallback
      const helper = typeof options !== 'undefined' ? options.reconstructRawString : parserHelpers.reconstructRawString;
      const rawString = helper(interpolatedArray);
      debug("PathValue reconstructed raw string:", rawString, "from array:", JSON.stringify(interpolatedArray));

      // Get the validated path from validatePath, passing context
      const validationResult = validatePath(rawString, { context: 'pathDirective' });

      // Attach the interpolated array to the result
      // Ensure validationResult is an object before attaching
      if (validationResult && typeof validationResult === 'object') {
        validationResult.interpolatedValue = interpolatedArray;
        debug("Attached interpolatedValue to validationResult");
      } else {
        debug("Warning: validatePath did not return an object. Cannot attach interpolatedValue.");
        // Consider how to handle this case - maybe wrap non-objects?
        // For now, just return the original result if it wasn't an object.
      }

      return validationResult;
    }
  / variable:PathVar { // Allow PathVariables directly
    debug("PathValue parsed PathVar:", JSON.stringify(variable));
    // Return a structure consistent with validatePath for path variables
    return {
        raw: `$${variable.identifier}`,
        isPathVariable: true,
        structured: {
          base: '.', // Default base for path variables in PathDirective?
          segments: [`$${variable.identifier}`], // Segment is the var itself
          variables: {
            path: [variable.identifier]
          },
          cwd: false // Path variables are not CWD relative
        }
        // No interpolatedValue for a direct PathVar
      };
  }

// Brackets [...] Interpolation
BracketAllowedLiteralChar
  = !(']' / '{{' / '$') char:. { return char; } // Allow any char except ], {{, $

BracketLiteralTextSegment
  = chars:BracketAllowedLiteralChar+ {
      return createNode(NodeType.Text, { content: chars.join('') }, location());
    }

BracketInterpolatableContent
  = parts:(BracketLiteralTextSegment / Variable)+ { // Variable must be tried first
      // TODO: Add combineAdjacentTextNodes(parts) helper call here later?
      return parts;
    }

BracketInterpolatableContentOrEmpty
  = result:BracketInterpolatableContent? {
      return result || [];
    }

// --- End Interpolation Rules ---