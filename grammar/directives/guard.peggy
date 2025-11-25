// GUARD DIRECTIVE
// Implements /guard parsing for security policy hooks.

SlashGuard
  = DirectiveContext "/guard" _ nameTiming:(name:GuardDirectiveName __ { return { name }; })? timing:GuardTiming __ filter:GuardFilterClause _ "=" _ guardBody:GuardWhenClause ending:CommentedDirectiveEnding? {
      helpers.debug('SlashGuard matched (new syntax - timing required)', { name: nameTiming?.name, timing, filter, guardBody });
      const guardTiming = timing;

      const values = {
        filter: [filter.node],
        guard: [guardBody.node]
      };

      if (nameTiming?.name) {
        values.name = [nameTiming.name];
      }

      const raw = {
        filter: filter.raw
      };

      if (nameTiming?.name) {
        raw.name = `@${nameTiming.name.identifier}`;
      }
      raw.timing = guardTiming;

      if (guardBody.modifier && guardBody.modifier !== 'default') {
        raw.modifier = guardBody.modifier;
      }

      const meta = {
        filterKind: filter.node.filterKind,
        filterValue: filter.node.value,
        scope: filter.node.scope,
        modifier: guardBody.modifier,
        ruleCount: guardBody.node.rules.length,
        hasName: Boolean(nameTiming?.name),
        timing: guardTiming,
        ...(ending?.comment ? { comment: ending.comment } : {})
      };

      return helpers.createStructuredDirective(
        DirectiveKind.guard,
        'guard',
        values,
        raw,
        meta,
        location(),
        'guard'
      );
    }
  / DirectiveContext "/guard" _ timing:GuardTiming? _ name:GuardDirectiveName? _ "for" __ filter:GuardFilterClause _ "=" _ guardBody:GuardWhenClause ending:CommentedDirectiveEnding? {
      helpers.debug('SlashGuard matched (old syntax with for)', { timing, name, filter, guardBody });
      const guardTiming = timing ?? 'before';

      const values = {
        filter: [filter.node],
        guard: [guardBody.node]
      };

      if (name) {
        values.name = [name];
      }

      const raw = {
        filter: filter.raw
      };

      if (name) {
        raw.name = `@${name.identifier}`;
      }
      raw.timing = guardTiming;

      if (guardBody.modifier && guardBody.modifier !== 'default') {
        raw.modifier = guardBody.modifier;
      }

      const meta = {
        filterKind: filter.node.filterKind,
        filterValue: filter.node.value,
        scope: filter.node.scope,
        modifier: guardBody.modifier,
        ruleCount: guardBody.node.rules.length,
        hasName: Boolean(name),
        timing: guardTiming,
        ...(ending?.comment ? { comment: ending.comment } : {})
      };

      return helpers.createStructuredDirective(
        DirectiveKind.guard,
        'guard',
        values,
        raw,
        meta,
        location(),
        'guard'
      );
    }
  / DirectiveContext "/guard" {
      return peg$FAILED;
    }

GuardDirectiveName
  = "@" id:BaseIdentifier {
      return helpers.createVariableReferenceNode('identifier', { identifier: id }, location());
    }

GuardTiming
  = "before" ![a-zA-Z0-9_] { return 'before'; }
  / "after" ![a-zA-Z0-9_] { return 'after'; }
  / "always" ![a-zA-Z0-9_] { return 'always'; }

GuardFilterClause
  = filter:GuardOperationFilter { return filter; }
  / filter:GuardDataFilter { return filter; }

GuardOperationFilter
  = "op:" identifier:GuardOpIdentifier {
      const raw = `op:${identifier}`;
      const node = helpers.createNode('GuardFilter', {
        filterKind: 'operation',
        scope: 'perOperation',
        value: identifier,
        raw,
        location: location()
      });
      return { node, raw };
    }

GuardDataFilter
  = label:DataLabelIdentifier {
      const node = helpers.createNode('GuardFilter', {
        filterKind: 'data',
        scope: 'perInput',
        value: label,
        raw: label,
        location: location()
      });
      return { node, raw: label };
    }

GuardOpIdentifier
  = first:BaseIdentifier rest:("." part:BaseIdentifier { return part; })* {
      return [first, ...rest].join('.');
    }

GuardWhenClause
  = "when" _ modifier:GuardModifier? _ "[" _ rules:GuardRuleList _ "]" {
      const modifierText = modifier ? modifier.content : 'default';
      const blockNode = helpers.createNode('GuardBlock', {
        modifier: modifierText,
        rules,
        location: location()
      });
      return {
        node: blockNode,
        modifier: modifierText
      };
    }

GuardModifier
  = WhenModifier

GuardRuleList
  = first:GuardRule rest:(GuardRuleSeparator rule:GuardRule { return rule; })* {
      return [first, ...rest];
    }

GuardRuleSeparator
  = WhenConditionSeparator

GuardRule
  = "*" _ "=>" _ action:GuardAction {
      return helpers.createNode('GuardRule', {
        isWildcard: true,
        action,
        location: location()
      });
    }
  / condition:GuardConditionExpression _ "=>" _ action:GuardAction {
      return helpers.createNode('GuardRule', {
        condition,
        action,
        location: location()
      });
    }

GuardConditionExpression
  = WhenConditionExpression

GuardAction
  = "allow" value:GuardActionValue? {
      return helpers.createNode('GuardAction', {
        decision: 'allow',
        value: value ? value.nodes : undefined,
        location: location()
      });
    }
  / "deny" message:GuardActionMessage? {
      if (!message) {
        helpers.mlldError('Guard deny actions require a quoted reason: deny "reason"', '"reason"', location());
      }
      return helpers.createNode('GuardAction', {
        decision: 'deny',
        message: message.value,
        rawMessage: message.raw,
        location: location()
      });
    }
  / "retry" message:GuardActionMessage? {
      if (!message) {
        helpers.mlldError('Guard retry actions require a hint: retry "hint"', '"hint"', location());
      }
      return helpers.createNode('GuardAction', {
        decision: 'retry',
        message: message.value,
        rawMessage: message.raw,
        location: location()
      });
    }

GuardActionValue
  = HWS !LineTerminator value:(UnifiedQuoteOrTemplate / UnifiedExpression) {
      const nodes = Array.isArray(value) ? value : [value];
      return {
        nodes,
        raw: text().trim()
      };
    }

GuardActionMessage
  = _ msg:StringLiteral {
      return {
        value: msg,
        raw: text().trim()
      };
    }
