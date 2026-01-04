// WHILE DIRECTIVE
// Bounded iteration directive that invokes an executable until completion

WhileKeyword
  = "/"? "while"

SlashWhile "while directive"
  = DirectiveContext WhileKeyword _ "(" _ cap:NumberLiteral _ rate:("," _ wait:TimeDurationLiteral)? _ ")" _ processor:UnifiedReferenceWithTail ending:StandardDirectiveEnding {
      const wait = rate ? rate[2] : null;
      const rateMs = wait ? helpers.ttlToSeconds(wait.value, wait.unit) * 1000 : null;

      const values = {
        cap: Number(cap),
        processor: [processor]
      };

      if (rateMs !== null) {
        values.rateMs = rateMs;
      }

      if (ending?.tail) {
        values.tail = ending.tail;
      }

      const raw = {
        cap: Number(cap),
        processor: processor.rawIdentifier || helpers.reconstructRawString(processor)
      };

      if (rateMs !== null) {
        raw.rateMs = rateMs;
      }

      if (ending?.tail) {
        raw.tail = ending.tail;
      }

      const meta = {
        hasCap: true,
        hasRate: rateMs !== null
      };

      if (ending?.parallel) {
        meta.parallel = ending.parallel;
      }

      if (ending?.comment) {
        meta.comment = ending.comment;
      }

      return helpers.createStructuredDirective(
        'while',
        'while',
        values,
        raw,
        meta,
        location(),
        'while'
      );
    }
  / DirectiveContext WhileKeyword _ "(" _ ")" {
      helpers.mlldError(
        "while() requires a maximum iteration count. Expected: while(<cap>[, <rate>]) @processor",
        "number",
        location()
      );
    }
  / DirectiveContext WhileKeyword _ "(" _ cap:NumberLiteral _ ")" _ !("@") {
      helpers.mlldError(
        "while expects an executable reference like @processor after the iteration cap.",
        "@",
        location()
      );
    }
  / DirectiveContext WhileKeyword _ !"(" {
      helpers.mlldError(
        "Missing '(' after while keyword. Expected: while(<cap>[, <rate>]) @processor",
        "(",
        location()
      );
    }
