// CHECKPOINT DIRECTIVE
// Registers a named execution checkpoint for resume invalidation.

CheckpointKeyword
  = "/"? "checkpoint" ![a-zA-Z0-9_]

CheckpointNameValue
  = value:ExpressionString { return value; }

SlashCheckpoint
  = DirectiveContext CheckpointKeyword __ name:CheckpointNameValue ending:CommentedDirectiveEnding? {
      const values = { name };
      const raw = { name };
      const meta = {
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
