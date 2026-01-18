// GUARD DIRECTIVE
// Implements /guard parsing for security policy hooks.

GuardKeyword
  = "/"? "guard"

SlashGuard
  = DirectiveContext GuardKeyword _ nameTiming:(name:GuardDirectiveName __ { return { name }; })? timing:GuardTiming __ filter:GuardFilterClause _ "=" _ guardBody:GuardWhenClause ending:CommentedDirectiveEnding? {
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
  / DirectiveContext GuardKeyword _ timing:GuardTiming? _ name:GuardDirectiveName? _ "for" __ filter:GuardFilterClause _ "=" _ guardBody:GuardWhenClause ending:CommentedDirectiveEnding? {
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
  / DirectiveContext GuardKeyword {
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
  / "when" _ modifier:GuardModifier? _ "[" _ {
      const blockStart = peg$currPos;
      const captured = helpers.captureBracketContent(input, blockStart);
      if (!captured) return peg$FAILED;
      helpers.reparseBlock({
        parse: peg$parse,
        SyntaxErrorClass: peg$SyntaxError,
        text: captured.content,
        startRule: 'GuardRuleList',
        baseLocation: peg$computeLocation(blockStart, blockStart),
        grammarSource: options.grammarSource,
        mode: options.mode
      });
    }
  / "when" _ modifier:GuardModifier? _ "[" _ &{
      let depth = 1;
      let i = peg$currPos;
      let inString = false;
      let quote = null;
      while (i < input.length && depth > 0) {
        const ch = input[i];
        if (inString) {
          if (ch === quote && input[i - 1] !== '\\') { inString = false; quote = null; }
        } else {
          if (ch === '"' || ch === '\'') { inString = true; quote = ch; }
          else if (ch === '[') depth++;
          else if (ch === ']') depth--;
        }
        i++;
      }
      return depth > 0;
    } {
      helpers.mlldError(
        `Unterminated guard block. Expected ']' to close the rule list.`,
        "]",
        location()
      );
    }

GuardModifier
  = WhenModifier

GuardRuleList
  = leadingComments:LeadingBlockComment* _ first:GuardEntry rest:(GuardRuleSeparator entry:GuardEntry { return entry; })* trailing:BlockComments* {
      const entries = [first, ...rest];
      // Attach leading comments to first entry's meta (immutable update)
      if (leadingComments.length > 0 && entries.length > 0) {
        const firstEntry = entries[0];
        if (firstEntry && typeof firstEntry === 'object') {
          const existingMeta = firstEntry.meta || {};
          entries[0] = {
            ...firstEntry,
            meta: {
              ...existingMeta,
              comment: existingMeta.comment || leadingComments[0],
              leadingComments: leadingComments
            }
          };
        }
      }
      return entries;
    }
  / BlockComments+ { return []; }

GuardRuleSeparator
  = WhenConditionSeparator

// Single entry in a guard block - either a let assignment or a guard rule
GuardEntry
  = LetAssignment  // let @x = value (local variable)
  / GuardRule      // condition => allow/deny

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
  = "env" value:GuardActionValue? {
      if (!value) {
        helpers.mlldError('Guard env actions require a config value: env @config', '@config', location());
      }
      return helpers.createNode('GuardAction', {
        decision: 'env',
        value: value ? value.nodes : undefined,
        location: location()
      });
    }
  / "allow" options:GuardAllowWithClause value:GuardActionValue? {
      return helpers.createNode('GuardAction', {
        decision: 'allow',
        value: value ? value.nodes : undefined,
        addLabels: options?.addLabels,
        removeLabels: options?.removeLabels,
        warning: options?.warning,
        location: location()
      });
    }
  / "allow" value:GuardActionValue options:GuardAllowWithClause? {
      return helpers.createNode('GuardAction', {
        decision: 'allow',
        value: value ? value.nodes : undefined,
        addLabels: options?.addLabels,
        removeLabels: options?.removeLabels,
        warning: options?.warning,
        location: location()
      });
    }
  / "allow" {
      return helpers.createNode('GuardAction', {
        decision: 'allow',
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

GuardAllowWithClause
  = HWS "with" _ "{" _ entries:GuardAllowEntries? _ "}" {
      const result = {};
      if (entries) {
        for (const [key, value] of entries) {
          result[key] = value;
        }
      }
      return result;
    }

GuardAllowEntries
  = first:GuardAllowEntry rest:(CommaSpace entry:GuardAllowEntry { return entry; })* {
      return [first, ...rest];
    }

GuardAllowEntry
  = "addLabels" _ ":" _ labels:GuardLabelList {
      return ["addLabels", labels];
    }
  / "removeLabels" _ ":" _ labels:GuardLabelList {
      return ["removeLabels", labels];
    }
  / "warning" _ ":" _ message:StringLiteral {
      return ["warning", message];
    }

GuardLabelList
  = "[" _ labels:GuardLabelItems? _ "]" {
      return labels || [];
    }

GuardLabelItems
  = first:GuardLabelItem rest:(CommaSpace label:GuardLabelItem { return label; })* {
      return [first, ...rest];
    }

GuardLabelItem
  = label:StringLiteral { return label; }
  / label:DataLabelIdentifier { return label; }

GuardActionMessage
  = _ msg:StringLiteral {
      return {
        value: msg,
        raw: text().trim()
      };
    }
