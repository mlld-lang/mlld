// LOOP DIRECTIVE
// Block-based iteration directive with bounds and conditions

LoopKeyword
  = "/"? "loop"

SlashLoop "loop directive"
  = DirectiveContext LoopKeyword _ header:LoopHeader? untilClause:LoopUntilClause? _ block:LoopBlockAction ending:StandardDirectiveEnding {
      const limit = header ? header.limit : null;
      const rateMs = header ? header.rateMs : null;
      const until = untilClause || null;
      const statements = block.statements || [];

      const hasLimit = header !== null && header !== undefined;
      const hasRate = header ? header.hasRate : false;
      const hasUntil = Array.isArray(untilClause) && untilClause.length > 0;

      const values = {
        ...(hasLimit ? { limit } : {}),
        ...(rateMs !== null ? { rateMs } : {}),
        ...(hasUntil ? { until } : {}),
        block: statements
      };

      const raw = {
        ...(hasLimit ? { limit: header.rawLimit } : {}),
        ...(rateMs !== null ? { rateMs } : {}),
        ...(hasUntil ? { until: helpers.reconstructRawString(until) } : {})
      };

      const meta = {
        hasLimit,
        hasRate: !!hasRate,
        hasUntil,
        ...(block.meta ? { statementCount: block.meta.statementCount } : {})
      };

      if (!hasLimit || header?.limitKind === 'endless') {
        meta.isEndless = true;
      }

      if (ending.comment) {
        meta.comment = ending.comment;
      }

      return helpers.createStructuredDirective(
        'loop',
        'loop',
        values,
        raw,
        meta,
        location(),
        'loop'
      );
    }
  / DirectiveContext LoopKeyword _ "(" _ ")" {
      helpers.mlldError(
        'loop() requires a limit or endless. Expected: loop(<cap>[, <rate>]) [ ... ]',
        'loop(10)',
        location()
      );
    }
  / DirectiveContext LoopKeyword _ limit:LoopLimit _ {
      helpers.mlldError(
        'Missing \'(\' after loop keyword. Expected: loop(<cap>[, <rate>]) [ ... ]',
        '(',
        location()
      );
    }
  / DirectiveContext LoopKeyword _ "until" _ !WhenConditionExpression {
      helpers.mlldError(
        'loop until requires a condition. Expected: loop until @condition [ ... ]',
        '@condition',
        location()
      );
    }
  / DirectiveContext LoopKeyword _ header:LoopHeader? untilClause:LoopUntilClause? _ !("[" / "until") {
      helpers.mlldError(
        'loop requires a block. Expected: loop [ ... ]',
        '[',
        location()
      );
    }
