// TAIL MODIFIERS - Unified syntax for directive modifiers
// Used by: All directives that support command execution
// Purpose: Provide consistent tail modifier syntax across mlld

TailModifiers "tail modifiers"
  = _ keyword:TailKeyword _ value:TailValue {
      helpers.debug('TailModifiers matched', { 
        keyword,
        valueType: Array.isArray(value) ? 'array' : typeof value,
        valueLength: Array.isArray(value) ? value.length : undefined
      });
      if (keyword === "with") {
        return value; // Already an object
      } else if (keyword === "|") {
        return { pipeline: value };
      } else if (keyword === "as") {
        return { asSection: value };
      } else {
        return { [keyword]: value };
      }
    }

TailKeyword = "trust" / "pipeline" / "|" / "needs" / "with" / "as"

TailValue
  = "{" _ props:WithProperties _ "}" { 
      // Convert WithProperties array to object
      const result = {};
      if (props) {
        for (const [key, value] of props) {
          result[key] = value;
        }
      }
      return result;
    }      // for 'with'
  / "[" _ items:PipelineCommandList _ "]" { return items; } // for 'pipeline'
  / transformers:PipelineShorthand { return transformers; }  // for '|'
  / level:TrustLevel { return level; }                       // for 'trust'
  / deps:NeedsObject { return deps; }                        // for 'needs'
  / title:AsSectionRenameString { return title; }            // for 'as'

PipelineShorthand
  = first:PipelineCommand rest:PipelineRest* {
      helpers.debug('PipelineShorthand matched', { 
        first: first?.rawIdentifier || first,
        restCount: rest.length,
        rest: rest.map(r => r?.rawIdentifier || r)
      });
      return [first, ...rest];
    }

PipelineRest
  = _ "|" _ cmd:PipelineCommand {
      helpers.debug('PipelineRest matched', { cmd: cmd?.rawIdentifier || cmd });
      return cmd;
    }