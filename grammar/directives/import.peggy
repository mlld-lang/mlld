// IMPORT DIRECTIVE
// Implementation of the /import directive for importing values from other Mlld files

/* 
# Import Directive

The import directive brings in variables from other Mlld files.
It can be used in these forms:
1. /import {var1, var2} from "path/to/file"  - Import specific variables
2. /import {*} from "path/to/file"          - Import all variables
*/

// Core content handlers (context, tokens, whitespace, variables, path)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL IMPORT DIRECTIVE
// -------------------------------------------------------------

// Primary /import directive
SlashImport
  = SlashImportShorthand
  / SlashImportFull
  
  // Error Recovery Rules for /import directive
  // -------------------------------------------
  
  // Error: Unclosed import list bracket
  / DirectiveContext "/import" _ "{" &{
      // Check if we have an unclosed bracket for import list
      let depth = 1;
      let i = peg$currPos;
      while (i < input.length && depth > 0) {
        if (input[i] === '{') depth++;
        else if (input[i] === '}') depth--;
        else if (input[i] === '\n' && depth > 0) return true; // Unclosed on newline
        i++;
      }
      return depth > 0;
    } {
      helpers.mlldError("Unclosed import list in /import directive. Expected closing brace for import list.", String.fromCharCode(125), location());
    }
    
  // Error: Missing 'from' keyword
  / DirectiveContext "/import" _ "{" _ ImportsList _ "}" _ &{
      return helpers.isMissingFromKeyword(input, peg$currPos);
    } {
      helpers.mlldError("Missing 'from' keyword in /import directive. Expected: /import { items } from \"path\"", "from", location());
    }
    
  // Error: Missing path after 'from'
  / DirectiveContext "/import" _ "{" _ ImportsList _ "}" _ "from" _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing path in /import directive. Expected a path after 'from' keyword.", "path", location());
    }
    
  // Error: Unclosed quoted path
  / DirectiveContext "/import" _ "{" _ ImportsList _ "}" _ "from" _ "\"" &{
      return helpers.detectMissingQuoteClose(input, peg$currPos, '"');
    } {
      helpers.mlldError("Unclosed quoted path in /import directive. Expected closing double quote (\").", "\"", location());
    }
    
  // Error: Unclosed single quoted path
  / DirectiveContext "/import" _ "{" _ ImportsList _ "}" _ "from" _ "'" &{
      return helpers.detectMissingQuoteClose(input, peg$currPos, "'");
    } {
      helpers.mlldError("Unclosed quoted path in /import directive. Expected closing single quote.", "'", location());
    }
    
  // Error: Unclosed bracket path
  / DirectiveContext "/import" _ "{" _ ImportsList _ "}" _ "from" _ "[" &{
      return helpers.isUnclosedArray(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed path bracket in /import directive. Expected closing bracket for path.", "]", location());
    }
    
  // Error: Invalid wildcard syntax (missing alias)
  / DirectiveContext "/import" _ "{" _ "*" _ "}" {
      helpers.mlldError("Wildcard imports must have an alias. Use: /import { * as name } from \"path\"", "as", location());
    }
    
  // Error: Missing content after /import
  / DirectiveContext "/import" _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing content in /import directive. Expected import list or path.", String.fromCharCode(123), location());
    }
    
  // Error: Invalid @ usage in shorthand
  / DirectiveContext "/import" _ "@" &{
      const nextChar = input[peg$currPos];
      // Check if it's not a valid special import or module reference
      const rest = input.substring(peg$currPos);
      const validStarts = ['INPUT', 'TIME', 'stdin'];
      const isValidSpecial = validStarts.some(s => rest.toUpperCase().startsWith(s.toUpperCase()));
      const isValidModule = /^[a-zA-Z_][a-zA-Z0-9_-]*\//.test(rest);
      return !isValidSpecial && !isValidModule;
    } {
      helpers.mlldError("Invalid import source. Expected @INPUT, @TIME, module reference (@author/module), or configured resolver path", "INPUT", location());
    }
    
  // Error: Unclosed shorthand path bracket
  / DirectiveContext "/import" _ "[" &{
      return helpers.isUnclosedArray(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed path bracket in /import shorthand. Expected closing bracket.", "]", location());
    }
    
  // Error: Generic /import syntax error (catch-all)
  / DirectiveContext "/import" {
      helpers.mlldError("Invalid /import syntax. Expected: /import \"path\", /import @module, or /import { items } from \"path\"", "\"", location());
    }

// Shorthand import: /import "path" or /import @input or /import "path" as name
SlashImportShorthand
  = DirectiveContext "/import" _ path:ImportPath alias:(_ "as" _ name:BaseIdentifier { return name; })? ttl:(_ TTLClause)? tail:TailModifiers? comment:InlineComment? {
      helpers.debug('SlashImportShorthand matched', { path, alias, ttl, tail });
      
      // NEW: Derive namespace from path if no alias provided
      let namespace = alias;
      if (!namespace) {
        // Extract namespace from path
        const pathStr = path.raw?.path || path.raw?.module || '';
        if (pathStr.startsWith('@') && pathStr.includes('/')) {
          // @author/module -> 'module'
          const parts = pathStr.split('/');
          namespace = parts[parts.length - 1].split('@')[0]; // Remove hash
        } else if (pathStr.includes('/')) {
          // ./path/to/file.mld -> 'file'
          const basename = pathStr.split('/').pop() || '';
          namespace = basename.replace(/\.(mlld|mld|md|json)$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
        } else {
          // Simple filename
          namespace = pathStr.replace(/\.(mlld|mld|md|json)$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
        }
      }
      
      // Create values object with namespace import structure
      const values = {
        namespace: [helpers.createNode(NodeType.Text, { content: namespace, location: location() })],  // Store namespace as array for consistency
        path: path.values?.path || path.values?.module || (typeof path === 'string' ? [helpers.createNode(NodeType.Text, { content: path, location: location() })] : path) // Handle different path formats
      };
      
      // Add TTL if present
      if (ttl) {
        values.ttl = ttl[1]; // Extract from [_, TTLClause]
      }
      
      // Add withClause if tail modifiers present
      if (tail) {
        values.withClause = tail;
      }
      
      // Create raw object with text segments
      const raw = {
        namespace: namespace,  // Store namespace in raw as well
        path: path.raw?.path || path.raw?.module || path // Handle string paths like @input
      };
      
      // Create meta object with path metadata
      const meta = {
        path: path.meta || {}
      };
      
      return helpers.createStructuredDirective(
        'import',
        'importNamespace',  // CHANGED from 'importAll'
        values,
        raw,
        meta,
        location(),
        'path'
      );
    }

// Full import with explicit imports list
SlashImportFull
  = DirectiveContext "/import" _ "{" _ imports:ImportsList _ "}" _ "from" _ path:ImportPath ttl:(_ TTLClause)? tail:TailModifiers? comment:InlineComment? {
      helpers.debug('SlashImport matched', { imports, path, ttl, tail });
      
      // Get the raw imports text
      const importsRaw = imports.map(item => {
        if (typeof item === 'string') {
          return item;
        } else {
          return `${item.original} as ${item.alias}`;
        }
      }).join(", ");
      
      // Determine subtype (importAll, importNamespace, or importSelected)
      let subtype;
      if (imports.length === 1) {
        if (imports[0] === '*') {
          subtype = 'importAll';
        } else if (typeof imports[0] === 'object' && imports[0].original === '*' && imports[0].alias) {
          subtype = 'importNamespace';
        } else {
          subtype = 'importSelected';
        }
      } else {
        subtype = 'importSelected';
      }
      
      // Create values object with variable references
      const values = {
        imports: imports.map(item => {
          if (typeof item === 'string') {
            return helpers.createVariableReferenceNode('import', { 
              identifier: item
            }, location());
          } else {
            return helpers.createVariableReferenceNode('import', { 
              identifier: item.original,
              alias: item.alias
            }, location());
          }
        }),
        path: path.values?.path || path.values?.module || path.values?.url || (typeof path === 'string' ? [helpers.createNode(NodeType.Text, { content: path, location: location() })] : path) // Handle file, module, and URL paths
      };
      
      // Add TTL if present
      if (ttl) {
        values.ttl = ttl[1]; // Extract from [_, TTLClause]
      }
      
      // Add withClause if tail modifiers present
      if (tail) {
        values.withClause = tail;
      }
      
      // Create raw object with text segments
      const raw = {
        imports: importsRaw,
        path: path.raw?.path || path.raw?.module || path.raw?.url || path // Handle file, module, and URL paths
      };
      
      // Create meta object with path metadata
      const meta = {
        path: path.meta || { 
          isSpecial: typeof path === 'string',
          pathSubtype: path.subtype 
        }
      };
      
      return helpers.createStructuredDirective(
        'import',
        subtype,
        values,
        raw,
        meta,
        location(),
        'path'  // Source parameter
      );
    }

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------

// Import path - handles special @input source, module references, and regular paths
ImportPath
  = "@INPUT"i {
      helpers.debug('ImportPath matched @INPUT');
      const matched = text();
      return {
        type: 'path',
        subtype: 'inputPath',
        values: { 
          path: [helpers.createNode(NodeType.Text, { content: matched, location: location() })]
        },
        raw: { 
          path: matched
        },
        meta: {
          isSpecial: true,
          source: 'stdin'  // Keep as 'stdin' internally for compatibility
        }
      };
    }
  / "@NOW"i {
      helpers.debug('ImportPath matched @NOW');
      const matched = text();
      return {
        type: 'path',
        subtype: 'nowPath',
        values: { 
          path: [helpers.createNode(NodeType.Text, { content: matched, location: location() })]
        },
        raw: { 
          path: matched
        },
        meta: {
          isSpecial: true,
          source: 'now'
        }
      };
    }
  / "@TIME"i {
      helpers.debug('ImportPath matched @TIME');
      const matched = text();
      return {
        type: 'path',
        subtype: 'timePath',
        values: { 
          path: [helpers.createNode(NodeType.Text, { content: matched, location: location() })]
        },
        raw: { 
          path: matched
        },
        meta: {
          isSpecial: true,
          source: 'time'
        }
      };
    }
  / "@stdin" {  // Keep for backward compatibility
      helpers.debug('ImportPath matched @stdin (deprecated)');
      return {
        type: 'path',
        subtype: 'inputPath',
        values: { 
          path: [helpers.createNode(NodeType.Text, { content: '@stdin', location: location() })]
        },
        raw: { 
          path: '@stdin'
        },
        meta: {
          isSpecial: true,
          source: 'stdin',
          deprecated: true
        }
      };
    }
  / SpecialVariablePath
  / ModuleReference
  / QuotedPath
  / ImportAlligatorAdapter
  // REMOVED: PathExpression - bracket syntax no longer supported

// Adapter to use AlligatorExpression for imports
ImportAlligatorAdapter
  = content:AlligatorExpression {
      helpers.debug('ImportAlligatorAdapter processing AlligatorExpression', { content });
      
      // Alligators in imports just load the file
      if (content.options && content.options.section) {
        helpers.mlldError("Section extraction is not supported in import paths. Use: /import { items } from <path>", ">", location());
      }
      
      // Convert alligator source to import path format
      if (content.source.type === 'path') {
        return {
          type: 'path',
          subtype: 'filePath',
          values: { 
            path: content.source.segments
          },
          raw: { 
            path: content.source.raw
          },
          meta: content.source.meta
        };
      } else if (content.source.type === 'url') {
        // Future: support importing from URLs
        helpers.mlldError("URL imports are not yet supported. Use: /import { items } from <local-file>", ">", location());
      }
      
      // Should not reach here
      helpers.mlldError("Invalid alligator content in import path", ">", location());
    }

// REMOVED: BracketImportPath - bracket syntax no longer supported

// Quoted path for imports
QuotedPath
  = content:InterpolatedDoubleQuoteContent {
      helpers.debug('QuotedPath matched with interpolation', { content });
      const rawPath = helpers.reconstructRawString(content);
      return {
        type: 'path',
        subtype: 'filePath',
        values: { 
          path: content
        },
        raw: { 
          path: rawPath
        },
        meta: helpers.createPathMetadata(rawPath, content)
      };
    }
  / "'" content:$([^']*) "'" {
      helpers.debug('QuotedPath matched single quotes (literal)', { content });
      return {
        type: 'path',
        subtype: 'filePath',
        values: { 
          path: [helpers.createNode(NodeType.Text, { content, location: location() })]
        },
        raw: { 
          path: content
        },
        meta: helpers.createPathMetadata(content, [helpers.createNode(NodeType.Text, { content, location: location() })])
      };
    }

// Module reference: @namespace/path/to/module@hash
ModuleReference
  = "@" id:ModuleIdentifier {
      const rawModule = `@${id.namespace}${id.path.length > 0 ? '/' + id.path.join('/') : ''}/${id.name}${id.hash ? '@' + id.hash : ''}`;
      return {
        type: 'module',
        subtype: 'moduleReference',
        values: {
          module: [helpers.createNode(NodeType.Text, { content: rawModule, location: location() })]
        },
        raw: {
          module: rawModule
        },
        meta: {
          isModule: true,
          namespace: id.namespace,
          path: id.path,
          name: id.name,
          ...(id.hash ? { hash: id.hash } : {})
        }
      };
    }

// Module identifier with namespace, path, name, and optional hash
ModuleIdentifier
  = namespace:ModuleNamespace "/" pathAndName:ModulePathAndName hash:("@" h:ShortHash { return h; })? {
      return {
        namespace,
        path: pathAndName.path,
        name: pathAndName.name,
        ...(hash ? { hash } : {})
      };
    }

// Module path and name - handles both @namespace/name and @namespace/path/to/name
ModulePathAndName
  = segments:(segment:ModulePath "/" { return segment; })* name:ModuleName {
      return {
        path: segments,
        name: name
      };
    }

// Module namespace (user or organization name) - allows hyphens
ModuleNamespace = ModuleIdentifierPart

// Module path segment - allows hyphens
ModulePath = ModuleIdentifierPart

// Module name - allows hyphens
ModuleName = ModuleIdentifierPart

// Module identifier part - like BaseIdentifier but allows hyphens
ModuleIdentifierPart "Module Identifier Part"
  = first:[a-zA-Z_] rest:[a-zA-Z0-9_-]* {
      return first + rest.join('');
    }

// Short hash (4+ hex characters)
ShortHash
  = chars:[a-f0-9]+ &{ return chars.length >= 4; } {
      return chars.join('');
    }

// Using standard list pattern from patterns/lists.peggy
ImportsList
  = "*" _ "as" _ aliasName:BaseIdentifier {
      // Only allow * with explicit alias
      return [{ original: "*", alias: aliasName }];
    }
  / "*" _ &{ return input[peg$currPos] === String.fromCharCode(125); } {
      // Provide helpful error for wildcard imports without alias
      helpers.mlldError(`Wildcard imports must have an alias. Use '/import { * as name }' or the shorthand '/import "path/to/file.mld" as name'`, "as", location());
    }
  / first:ImportItem rest:(CommaSpace item:ImportItem { return item; })* {
      return [first, ...rest];
    }
  / _ {
      return [];
    }

// Individual import item with optional alias
ImportItem
  = name:BaseIdentifier alias:(" as " aliasName:BaseIdentifier { return aliasName; })? {
      if (alias) {
        return { original: name, alias: alias };
      }
      return name;
    }

// Path parts for import context - allows @var interpolation
ImportPathParts
  = parts:(VariableNoTail / PathTextSegment / PathSeparator)* {
      return parts;
    }


// Special variable path - handles @. followed by path segments
SpecialVariablePath
  = special:SpecialVariable path:(PathTextSegment / PathSeparator)+ {
      helpers.debug('SpecialVariablePath matched', { special, path });
      const pathParts = [special, ...path];
      const rawPath = (special.values?.originalForm || '@' + special.values?.identifier) + helpers.reconstructRawString(path);
      return {
        type: 'path',
        subtype: 'specialPath',
        values: { 
          path: pathParts
        },
        raw: { 
          path: rawPath
        },
        meta: {
          isSpecial: true,
          variable: special.values?.identifier,
          originalForm: special.values?.originalForm
        }
      };
    }