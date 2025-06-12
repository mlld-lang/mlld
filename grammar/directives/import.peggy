// IMPORT DIRECTIVE
// Implementation of the @import directive for importing values from other Mlld files

/* 
# Import Directive

The import directive brings in variables from other Mlld files.
It can be used in these forms:
1. @import {var1, var2} from "path/to/file"  - Import specific variables
2. @import {*} from "path/to/file"          - Import all variables
*/

// Core content handlers (context, tokens, whitespace, variables, path)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL IMPORT DIRECTIVE
// -------------------------------------------------------------

// Primary @import directive
AtImport
  = AtImportShorthand
  / AtImportFull

// Shorthand import: @import [path] or @import @input
AtImportShorthand
  = DirectiveContext "@import" _ path:ImportPath ttl:(_ TTLClause)? tail:TailModifiers? {
      helpers.debug('AtImportShorthand matched', { path, ttl, tail });
      
      // Shorthand always imports all (*)
      const imports = ["*"];
      const importsRaw = "*";
      
      // Create values object with variable references
      const values = {
        imports: [helpers.createVariableReferenceNode('import', { 
          identifier: '*'
        })],
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
        imports: importsRaw,
        path: path.raw?.path || path.raw?.module || path // Handle string paths like @input
      };
      
      // Create meta object with path metadata
      const meta = {
        path: path.meta || {}
      };
      
      return helpers.createStructuredDirective(
        'import',
        'importAll',
        values,
        raw,
        meta,
        location(),
        'path'
      );
    }

// Full import with explicit imports list
AtImportFull
  = DirectiveContext "@import" _ "{" _ imports:ImportsList _ "}" _ "from" _ path:ImportPath ttl:(_ TTLClause)? tail:TailModifiers? {
      helpers.debug('AtImport matched', { imports, path, ttl, tail });
      
      // Get the raw imports text
      const importsRaw = imports.map(item => {
        if (typeof item === 'string') {
          return item;
        } else {
          return `${item.original} as ${item.alias}`;
        }
      }).join(", ");
      
      // Determine subtype (importAll or importSelected)
      let subtype;
      if (imports.length === 1 && imports[0] === '*') {
        subtype = 'importAll';
      } else {
        subtype = 'importSelected';
      }
      
      // Create values object with variable references
      const values = {
        imports: imports.map(item => {
          if (typeof item === 'string') {
            return helpers.createVariableReferenceNode('import', { 
              identifier: item
            });
          } else {
            return helpers.createVariableReferenceNode('import', { 
              identifier: item.original,
              alias: item.alias
            });
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
  = "@input" {
      helpers.debug('ImportPath matched @input');
      return {
        type: 'path',
        subtype: 'inputPath',
        values: { 
          path: [helpers.createNode(NodeType.Text, { content: '@input', location: location() })]
        },
        raw: { 
          path: '@input'
        },
        meta: {
          isSpecial: true,
          source: 'stdin'  // Keep as 'stdin' internally for compatibility
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
  / BracketImportPath
  / PathExpression

// Bracketed path for imports - handles [@var/path]
BracketImportPath
  = "[" parts:ImportPathParts "]" {
      helpers.debug('BracketImportPath matched', { parts });
      const rawPath = helpers.reconstructRawString(parts);
      return {
        type: 'path',
        subtype: 'filePath',
        values: { 
          path: parts
        },
        raw: { 
          path: rawPath
        },
        meta: helpers.createPathMetadata(rawPath, parts)
      };
    }

// Quoted path for imports
QuotedPath
  = "\"" content:$([^"]*) "\"" {
      helpers.debug('QuotedPath matched', { content });
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
  = "*" {
      // * means import all variables with their original names - cannot be aliased
      return ["*"];
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
  = parts:(ImportPathVariable / PathTextSegment / PathSeparator)* {
      return parts;
    }

// Variable in import path context
ImportPathVariable  
  = "@" id:BaseIdentifier fields:AnyFieldAccess* {
      const normalizedId = helpers.normalizePathVar(id);
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalizedId,
        ...(fields.length > 0 ? { fields: fields } : {})
      }, location());
    }
  / SpecialVariable  // Special vars like @., @TIME, etc.

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