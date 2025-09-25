// DIRECTIVE ENDING - Unified pattern for directive termination
// Used by: All directives that need consistent tail handling
// Purpose: Provide single source of truth for directive ending patterns
// Level: 4 (Combinatorial patterns)

// Standard directive ending with tail modifiers and comments
StandardDirectiveEnding "standard directive ending"
  = tail:TailModifiers? comment:InlineComment? {
      helpers.debug('StandardDirectiveEnding matched', { 
        hasTail: !!tail,
        hasComment: !!comment 
      });
      return {
        tail: tail || null,
        comment: comment || null
      };
    }

// Directive ending with security options (for /var, /exe, etc.)
SecuredDirectiveEnding "secured directive ending"  
  = tail:TailModifiers? comment:InlineComment? {
      helpers.debug('SecuredDirectiveEnding matched', { 
        hasTail: !!tail,
        hasComment: !!comment 
      });
      return {
        tail: tail || null,
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
