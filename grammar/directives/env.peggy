// ENV DIRECTIVE
// Scoped environment execution blocks with tool scoping

EnvKeyword
  = "/"? "env"

EnvConfigExpression "env config expression"
  = UnifiedReferenceNoTailLoose
  / Expression

SlashEnv "env directive"
  = DirectiveContext EnvKeyword _ config:EnvConfigExpression withClause:WithClause? _ block:ExeStatementBlock ending:StandardDirectiveEnding {
      const values = {
        config: [config],
        block,
        ...(withClause ? { withClause } : {})
      };

      const raw = {
        config: helpers.reconstructRawString([config])
      };

      const meta = {
        statementCount: block?.meta?.statementCount ?? (block?.values?.statements?.length || 0),
        hasReturn: block?.meta?.hasReturn === true
      };

      if (withClause) {
        raw.withClause = withClause;
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
  / DirectiveContext EnvKeyword _ !EnvConfigExpression {
      helpers.mlldError(
        'env requires a config expression. Expected: env @config [ ... ]',
        '@config',
        location()
      );
    }
  / DirectiveContext EnvKeyword _ config:EnvConfigExpression withClause:WithClause? _ !("[" / BlockComments) {
      helpers.mlldError(
        'env requires a block. Expected: env @config [ ... ]',
        '[',
        location()
      );
    }
