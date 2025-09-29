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

TailKeyword = "pipeline" / "|" / "needs" / "with" / "as"

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
  / "[" _ items:PipelineStageList _ "]" { return items; } // for 'pipeline' (supports parallel groups)
  / transformers:PipelineShorthand { return transformers; }  // for '|'
  / deps:NeedsObject { return deps; }                        // for 'needs'
  / title:AsSectionRenameString { return title; }            // for 'as'

// Support parallel groups with `||` inside pipeline shorthand.
// Leading parallel groups are now allowed.
// Example: | @a || @b || @c | @d  -> [[a,b,c], d]
PipelineShorthand
  = first:PipelineStageFirst rest:PipelineRest* {
      helpers.debug('PipelineShorthand matched', {
        first: first?.rawIdentifier || first,
        restCount: rest.length,
        rest: rest.map(r => r?.rawIdentifier || r)
      });
      return [first, ...rest];
    }

PipelineStageFirst
  = ParallelSequence
  / PipelineCommand

// A rest stage can be a single command or a parallel group separated by `||`
PipelineRest
  = _ "|" _ group:ParallelSequence {
      helpers.debug('PipelineRest matched (parallel)', { count: Array.isArray(group) ? group.length : 1 });
      return group; // Array of commands represents a parallel stage
    }
  / _ "|" _ cmd:PipelineCommand {
      helpers.debug('PipelineRest matched', { cmd: cmd?.rawIdentifier || cmd });
      return cmd;
    }

// One pipeline stage consisting of multiple commands executed in parallel
ParallelSequence
  = first:PipelineCommand rest:(_ "||" _ c:PipelineCommand { return c; })+ {
      return [first, ...rest];
    }
