// BOX DIRECTIVE
// Scoped environment execution blocks with tool scoping

BoxKeyword
  = "/"? "box"

BoxConfigExpression "box config expression"
  = UnifiedReferenceNoTailLoose
  / Expression

SlashBox "box directive"
  = DirectiveContext BoxKeyword _ config:BoxConfigExpression? withClause:WithClause? &{ return !!config || !!withClause; } _ block:ExeStatementBlock ending:StandardDirectiveEnding {
      const values = {
        ...(config ? { config: [config] } : {}),
        ...(withClause ? { withClause } : {}),
        block
      };

      const raw = {};
      if (config) {
        raw.config = helpers.reconstructRawString([config]);
      }
      if (withClause) {
        raw.withClause = withClause;
      }

      const meta = {
        statementCount: block?.meta?.statementCount ?? (block?.values?.statements?.length || 0),
        hasReturn: block?.meta?.hasReturn === true
      };

      if (withClause) {
        meta.withClause = withClause;
      }

      if (ending?.comment) {
        meta.comment = ending.comment;
      }

      return helpers.createStructuredDirective(
        'box',
        'box',
        values,
        raw,
        meta,
        location(),
        'box'
      );
    }
  / DirectiveContext BoxKeyword _ config:BoxConfigExpression? withClause:WithClause? &{ return !config && !withClause; } {
      helpers.mlldError(
        'box requires a config expression or with clause. Expected: box @config [ ... ] or box with { ... } [ ... ]',
        '@config or with { ... }',
        location()
      );
    }
  / DirectiveContext BoxKeyword _ config:BoxConfigExpression? withClause:WithClause? _ !("[" / BlockComments) {
      helpers.mlldError(
        'box requires a block. Expected: box @config [ ... ] or box with { ... } [ ... ]',
        '[',
        location()
      );
    }
