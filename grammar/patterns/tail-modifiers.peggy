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
      } else if (keyword === "||" || keyword === "|") {
        return { pipeline: value };
      } else if (keyword === "as") {
        return { asSection: value };
      } else {
        return { [keyword]: value };
      }
    }

TailKeyword = "pipeline" / "|" / "with" / "as"

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
  / title:AsSectionRenameString { return title; }            // for 'as'

// Support parallel groups with `||` inside pipeline shorthand.
// Leading parallel groups are now allowed with || prefix.
// Example: || @a || @b || @c | @d  -> [[a,b,c], d]
PipelineShorthand
  = first:PipelineStageFirst rest:PipelineRest* {
      helpers.debug('PipelineShorthand matched', {
        first: first?.rawIdentifier || first,
        restCount: rest.length,
        rest: rest.map(r => r?.rawIdentifier || r)
      });
      return [first, ...rest];
    }

// Leading parallel pipeline - starts with || to indicate parallel execution
// Only matches when followed by @ and identifier with parentheses (function call)
// This avoids conflicting with boolean OR expressions like @a || @b
// Example: || @a() || @b() || @c() -> pipeline parallel
// Example: @a || @b -> boolean OR (not matched here)
LeadingParallelPipeline
  = "||" _
    // Lookahead: only match if next token is a function call (@func()), not a boolean OR expression.
    // This ensures parallel pipeline syntax only applies to function calls.
    &("@" BaseIdentifier _ "(")
    group:ParallelSequence rest:PipelineRest* caps:PipelineParallelSpec? {
      helpers.debug('LeadingParallelPipeline matched', {
        groupSize: group.length,
        restCount: rest.length,
        hasCaps: !!caps
      });
      // Leading || creates a parallel group as first stage
      const pipeline = [group, ...rest];
      const withClause = {
        pipeline,
        ...(caps ? { parallel: caps.parallel, delayMs: caps.delayMs } : {})
      };
      // Provide a placeholder text node so directives can supply an initial value
      const placeholder = helpers.createNode(NodeType.Text, {
        content: '',
        location: location()
      });
      return {
        type: 'LeadingParallelPipeline',
        placeholder,
        withClause
      };
    }

PipelineStageFirst
  = ParallelSequence
  / PipelineStageEntry

// A rest stage can be a single command or a parallel group separated by `||`
PipelineRest
  = _ "|" _ group:ParallelSequence {
      helpers.debug('PipelineRest matched (parallel)', { count: Array.isArray(group) ? group.length : 1 });
      return group; // Array of commands represents a parallel stage
    }
  / _ "|" _ cmd:PipelineStageEntry {
      helpers.debug('PipelineRest matched', { cmd: cmd?.rawIdentifier || cmd });
      return cmd;
    }

// One pipeline stage consisting of multiple commands executed in parallel
ParallelSequence
  = leading:("||" _)? first:PipelineStageEntry rest:(_ "||" _ c:PipelineStageEntry { return c; })+ {
      return [first, ...rest];
    }
