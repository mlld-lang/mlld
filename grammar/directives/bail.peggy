// BAIL DIRECTIVE
// Terminates script execution immediately with exit code 1.

BailKeyword
  = "/"? "bail" ![a-zA-Z0-9_]

BailMessage
  = HWS !LineTerminator value:VarRHSContent {
      return Array.isArray(value) ? value : [value];
    }

SlashBail
  = DirectiveContext BailKeyword message:BailMessage? ending:CommentedDirectiveEnding? {
      const resolvedMessage = message || [];
      const values = { message: resolvedMessage };
      const raw = {
        message: helpers.reconstructRawString(resolvedMessage)
      };
      const meta = {
        hasMessage: resolvedMessage.length > 0,
        ...(ending?.comment ? { comment: ending.comment } : {})
      };

      return helpers.createStructuredDirective(
        DirectiveKind.bail,
        'bail',
        values,
        raw,
        meta,
        location(),
        'directive'
      );
    }

BailAction
  = "bail" ![a-zA-Z0-9_] message:BailMessage? ending:CommentedDirectiveEnding? {
      const resolvedMessage = message || [];
      const values = { message: resolvedMessage };
      const raw = {
        message: helpers.reconstructRawString(resolvedMessage)
      };
      const meta = {
        hasMessage: resolvedMessage.length > 0,
        ...(ending?.comment ? { comment: ending.comment } : {})
      };

      return [helpers.createStructuredDirective(
        DirectiveKind.bail,
        'bail',
        values,
        raw,
        meta,
        location(),
        'directive'
      )];
    }
