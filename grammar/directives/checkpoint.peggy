// CHECKPOINT DIRECTIVE
// Registers a named execution checkpoint for resume invalidation.

CheckpointKeyword
  = "/"? "checkpoint" ![a-zA-Z0-9_]

CheckpointNameValue
  = value:ExpressionString { return value; }

CheckpointResumeModeValue
  = value:$("auto" / "manual" / "never") { return value; }
  / value:DataString { return value; }

CheckpointTTLValue
  = value:TimeDurationLiteral { return value; }
  / value:DataString { return value; }
  / value:NumberLiteral { return Number(value); }

CheckpointWithClause
  = _ "with" _ "{" _ props:CheckpointWithProperties? _ "}" {
      const result = {};
      if (props) {
        for (const [key, value] of props) {
          result[key] = value;
        }
      }
      return result;
    }

CheckpointWithProperties
  = first:CheckpointWithProperty rest:(CommaSpace prop:CheckpointWithProperty { return prop; })* {
      return [first, ...rest];
    }

CheckpointWithProperty
  = "resume" _ ":" _ value:CheckpointResumeModeValue {
      return ["resume", value];
    }
  / "ttl" _ ":" _ value:CheckpointTTLValue {
      return ["ttl", value];
    }
  / "complete" _ ":" _ value:Expression {
      return ["complete", value];
    }

SlashCheckpoint
  = DirectiveContext CheckpointKeyword __ name:CheckpointNameValue withClause:CheckpointWithClause? ending:CommentedDirectiveEnding? {
      const values = {
        name,
        ...(withClause ? { withClause } : {})
      };
      const raw = {
        name,
        ...(withClause ? { withClause } : {})
      };
      const meta = {
        ...(withClause ? { withClause } : {}),
        ...(ending?.comment ? { comment: ending.comment } : {})
      };

      return helpers.createStructuredDirective(
        DirectiveKind.checkpoint,
        'checkpoint',
        values,
        raw,
        meta,
        location(),
        'directive'
      );
    }
