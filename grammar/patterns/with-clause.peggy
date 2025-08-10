// WITH CLAUSE PATTERN
// Pattern for the 'with' clause that supports pipeline and needs options

// -------------------------------------------------------------
// MAIN WITH CLAUSE
// -------------------------------------------------------------

// With clause for run/exec directives
WithClause
  = _ "with" _ object:WithObject {
      helpers.debug('WithClause matched', { object });
      return object;
    }

// Object containing pipeline and/or needs
WithObject
  = "{" _ props:WithProperties? _ "}" {
      const result = {};
      if (props) {
        for (const [key, value] of props) {
          result[key] = value;
        }
      }
      return result;
    }

// Properties list for with clause
WithProperties
  = first:WithProperty rest:(CommaSpace prop:WithProperty { return prop; })* {
      return [first, ...rest];
    }

// Individual property (pipeline or needs)
WithProperty
  = "pipeline" _ ":" _ pipeline:PipelineArray {
      return ["pipeline", pipeline];
    }
  / "needs" _ ":" _ needs:NeedsObject {
      return ["needs", needs];
    }
  / "format" _ ":" _ format:DataString {
      return ["format", format];
    }
  / "asSection" _ ":" _ title:AsSectionRenameString {
      return ["asSection", title];
    }

// -------------------------------------------------------------
// PIPELINE SUPPORT
// -------------------------------------------------------------

// Array of pipeline commands
PipelineArray
  = "[" _ commands:PipelineCommandList? _ "]" {
      return commands || [];
    }

// List of pipeline commands
PipelineCommandList
  = first:PipelineCommand rest:(CommaSpace cmd:PipelineCommand { return cmd; })* {
      return [first, ...rest];
    }

// Single pipeline command (command reference with @input support)
// Uses UnifiedReferenceForPipeline to prevent nested pipelines
PipelineCommand
  = ref:UnifiedReferenceForPipeline {
      helpers.debug('PipelineCommand matched unified reference', { ref });
      
      // Handle ExecInvocation, VariableReferenceWithTail, and VariableReference types
      if (ref.type === 'ExecInvocation') {
        return {
          identifier: ref.commandRef.identifier,
          args: ref.commandRef.args || [],
          fields: [],
          rawIdentifier: ref.commandRef.name,
          rawArgs: ref.commandRef.args ? ref.commandRef.args.map(arg => 
            arg.type === NodeType.Text ? arg.content : 
            arg.type === NodeType.VariableReference ? '@' + arg.identifier : ''
          ) : []
        };
      } else if (ref.type === 'VariableReferenceWithTail') {
        // Variable with tail modifiers - should not happen in pipeline context
        // Extract just the variable part and ignore the tail
        const variable = ref.variable;
        return {
          identifier: [variable],
          args: [],
          fields: variable.fields || [],
          rawIdentifier: variable.identifier,
          rawArgs: []
        };
      } else {
        // Plain variable reference
        return {
          identifier: [ref],
          args: [],
          fields: ref.fields || [],
          rawIdentifier: ref.identifier,
          rawArgs: []
        };
      }
    }

// -------------------------------------------------------------
// NEEDS SUPPORT
// -------------------------------------------------------------

// Object containing language-specific dependencies
NeedsObject
  = "{" _ langs:NeedsLanguageList? _ "}" {
      const result = {};
      if (langs) {
        for (const [lang, packages] of langs) {
          result[lang] = packages;
        }
      }
      return result;
    }

// List of language entries
NeedsLanguageList
  = first:NeedsLanguageEntry rest:(CommaSpace entry:NeedsLanguageEntry { return entry; })* {
      return [first, ...rest];
    }

// Single language entry (e.g., "node": { ... })
NeedsLanguageEntry
  = lang:DataString _ ":" _ packages:PackagesObject {
      return [lang, packages];
    }

// Object containing package dependencies
PackagesObject
  = "{" _ packages:PackagesList? _ "}" {
      const result = {};
      if (packages) {
        for (const [pkg, version] of packages) {
          result[pkg] = version;
        }
      }
      return result;
    }

// List of package entries
PackagesList
  = first:PackageEntry rest:(CommaSpace entry:PackageEntry { return entry; })* {
      return [first, ...rest];
    }

// Single package entry (e.g., "lodash": "^4.17.0")
PackageEntry
  = pkg:DataString _ ":" _ version:DataString {
      return [pkg, version];
    }