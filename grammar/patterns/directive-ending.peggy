// DIRECTIVE ENDING - Unified pattern for directive termination
// Used by: All directives that need consistent tail handling
// Purpose: Provide single source of truth for directive ending patterns
// Level: 4 (Combinatorial patterns)

// Standard directive ending with tail modifiers and comments
StandardDirectiveEnding "standard directive ending"
  = tail:TailModifiers? caps:PipelineParallelSpec? comment:InlineComment? {
      helpers.debug('StandardDirectiveEnding matched', {
        hasTail: !!tail,
        hasCaps: !!caps,
        hasComment: !!comment
      });
      return {
        tail: tail || null,
        parallel: caps || null,
        comment: comment || null
      };
    }

// Directive ending with security options (for /var, /exe, etc.)
SecuredDirectiveEnding "secured directive ending"
  = tail:TailModifiers? caps:PipelineParallelSpec? security:(_ s:SecurityOptions { return s; })? comment:InlineComment? {
      helpers.debug('SecuredDirectiveEnding matched', {
        hasTail: !!tail,
        hasCaps: !!caps,
        hasSecurity: !!security,
        hasComment: !!comment
      });
      return {
        tail: tail || null,
        parallel: caps || null,
        security: security || null,
        comment: comment || null
      };
    }

// Basic ending with just comment support (for simpler directives)
CommentedDirectiveEnding "commented directive ending"
  = comment:InlineComment? {
      helpers.debug('CommentedDirectiveEnding matched', {
        hasComment: !!comment
      });
      return {
        comment: comment || null
      };
    }

// Optional parallel caps for pipeline shorthand, e.g., (3, 20s)
PipelineParallelSpec
  = _ "(" _ cap:NumberLiteral _ "," _ wait:TimeDurationLiteral _ ")" {
      const delayMs = helpers.ttlToSeconds(wait.value, wait.unit) * 1000;
      return { parallel: Number(cap), delayMs };
    }
  / _ "(" _ capOnly:NumberLiteral _ ")" {
      return { parallel: Number(capOnly) };
    }