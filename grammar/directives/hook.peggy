// HOOK DIRECTIVE
// Implements /hook parsing for user lifecycle hooks.

HookKeyword
  = "/"? "hook"

SlashHook
  = DirectiveContext HookKeyword _ nameTiming:(name:HookDirectiveName __ { return { name }; })? timing:HookTiming __ filter:HookFilterClause _ "=" _ hookBody:HookBody ending:CommentedDirectiveEnding? {
      helpers.debug('SlashHook matched', { name: nameTiming?.name, timing, filter });

      const hookTiming = timing;
      const values = {
        filter: [filter.node],
        body: [hookBody.node]
      };

      if (nameTiming?.name) {
        values.name = [nameTiming.name];
      }

      const raw = {
        filter: filter.raw,
        timing: hookTiming
      };

      if (nameTiming?.name) {
        raw.name = `@${nameTiming.name.identifier}`;
      }
      if (filter.argPattern) {
        raw.argPattern = filter.argPattern;
      }

      const meta = {
        filterKind: filter.node.filterKind,
        filterValue: filter.node.value,
        scope: filter.node.scope,
        hasName: Boolean(nameTiming?.name),
        timing: hookTiming,
        hasArgPattern: Boolean(filter.argPattern),
        bodyKind: hookBody.bodyKind,
        ...(ending?.comment ? { comment: ending.comment } : {})
      };

      return helpers.createStructuredDirective(
        DirectiveKind.hook,
        'hook',
        values,
        raw,
        meta,
        location(),
        'hook'
      );
    }
  / DirectiveContext HookKeyword {
      return peg$FAILED;
    }

HookDirectiveName
  = "@" id:BaseIdentifier {
      return helpers.createVariableReferenceNode('identifier', { identifier: id }, location());
    }

HookTiming
  = "before" ![a-zA-Z0-9_] { return 'before'; }
  / "after" ![a-zA-Z0-9_] { return 'after'; }

HookFilterClause
  = filter:HookFunctionFilter { return filter; }
  / filter:HookOperationFilter { return filter; }
  / filter:HookDataFilter { return filter; }

HookFunctionFilter
  = "@" identifier:HookFunctionIdentifier argPattern:HookFunctionArgPattern? {
      const raw = text();
      const node = helpers.createNode('HookFilter', {
        filterKind: 'function',
        scope: 'perFunction',
        value: identifier,
        argPattern: argPattern ?? null,
        raw,
        location: location()
      });
      return { node, raw, argPattern: argPattern ?? null };
    }

HookFunctionIdentifier
  = first:BaseIdentifier rest:("." part:BaseIdentifier { return part; })* {
      return [first, ...rest].join('.');
    }

HookFunctionArgPattern
  = "(" _ pattern:StringLiteral _ ")" {
      return pattern;
    }

HookOperationFilter
  = "op:" identifier:HookOperationIdentifier {
      const raw = `op:${identifier}`;
      const node = helpers.createNode('HookFilter', {
        filterKind: 'operation',
        scope: 'perOperation',
        value: identifier,
        raw,
        location: location()
      });
      return { node, raw, argPattern: null };
    }

HookOperationIdentifier
  = first:BaseIdentifier rest:(":" part:BaseIdentifier { return part; })* {
      return [first, ...rest].join(':');
    }

HookDataFilter
  = label:DataLabelIdentifier {
      const node = helpers.createNode('HookFilter', {
        filterKind: 'data',
        scope: 'perInput',
        value: label,
        raw: label,
        location: location()
      });
      return { node, raw: label, argPattern: null };
    }

HookBody
  = whenExpr:WhenExpressionAny {
      return { node: whenExpr, bodyKind: 'when' };
    }
  / block:ForBlockAction {
      const statements = Array.isArray(block?.statements) ? block.statements : [];
      const hookBlock = helpers.createNode('HookBlock', {
        statements,
        meta: block?.meta || {
          statementCount: statements.length,
          hasReturn: false
        },
        location: location()
      });
      return { node: hookBlock, bodyKind: 'block' };
    }
