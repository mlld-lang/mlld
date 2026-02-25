// ENV DIRECTIVE
// Scoped environment execution blocks with tool scoping

EnvKeyword
  = "/"? "env"

EnvConfigExpression "env config expression"
  = UnifiedReferenceNoTailLoose
  / Expression

SlashEnv "env directive"
  = DirectiveContext EnvKeyword _ config:EnvConfigExpression? withClause:WithClause? &{ return !!config || !!withClause; } _ block:ExeStatementBlock ending:StandardDirectiveEnding {
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
        'env',
        'env',
        values,
        raw,
        meta,
        location(),
        'env'
      );
    }
  / DirectiveContext EnvKeyword _ config:EnvConfigExpression? withClause:WithClause? &{ return !config && !withClause; } {
      helpers.mlldError(
        'env requires a config expression or with clause. Expected: env @config [ ... ] or env with { ... } [ ... ]',
        '@config or with { ... }',
        location()
      );
    }
  / DirectiveContext EnvKeyword _ config:EnvConfigExpression? withClause:WithClause? _ !("[" / BlockComments) {
      helpers.mlldError(
        'env requires a block. Expected: env @config [ ... ] or env with { ... } [ ... ]',
        '[',
        location()
      );
    }
