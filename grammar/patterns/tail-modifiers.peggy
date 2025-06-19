// TAIL MODIFIERS - Unified syntax for directive modifiers
// Used by: All directives that support command execution
// Purpose: Provide consistent tail modifier syntax across mlld

TailModifiers "tail modifiers"
  = _ keyword:TailKeyword _ value:TailValue {
      if (keyword === "with") {
        return value; // Already an object
      } else if (keyword === "|") {
        return { pipeline: value };
      } else {
        return { [keyword]: value };
      }
    }

TailKeyword = "trust" / "pipeline" / "|" / "needs" / "with"

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

PipelineShorthand
  = first:PipelineCommand rest:(HWS &{ 
      // Check if we're still on the same line
      const pos = peg$currPos;
      const beforePos = input.lastIndexOf('\n', pos - 1);
      const afterPos = input.indexOf('\n', pos);
      const hasNewlineBefore = beforePos >= 0 && !input.substring(beforePos + 1, pos).trim();
      return !hasNewlineBefore;
    } ref:PipelineCommand { return ref; })* {
      return [first, ...rest];
    }