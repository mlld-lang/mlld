// IF DIRECTIVE
// Conditional execution with optional else block

IfKeyword
  = "/"? "if"

SlashIf
  = IfKeyword _ condition:WhenConditionExpression _ thenBlock:IfActionBlock elseBlock:IfElseBlock? {
      helpers.debug('SlashIf matched', { condition, thenBlock, elseBlock });

      const hasElse = !!elseBlock;
      const hasReturn = Array.isArray(thenBlock) && thenBlock.some(node => node && node.type === 'ExeReturn') ||
        (Array.isArray(elseBlock) && elseBlock.some(node => node && node.type === 'ExeReturn'));

      const values = {
        condition: condition,
        then: thenBlock
      };
      if (elseBlock) {
        values.else = elseBlock;
      }

      const raw = {
        condition: helpers.reconstructRawString(condition),
        then: helpers.reconstructRawString(thenBlock)
      };
      if (elseBlock) {
        raw.else = helpers.reconstructRawString(elseBlock);
      }

      return helpers.createStructuredDirective(
        'if',
        'ifBlock',
        values,
        raw,
        {
          hasElse,
          hasReturn
        },
        location()
      );
    }
  / IfKeyword _ condition:WhenConditionExpression _ "=>" {
      helpers.mlldError(
        "Invalid if syntax: 'if' uses brackets for blocks.\n\n" +
        "Mental model: 'if' runs actions; 'when' returns values.\n\n" +
        "Valid forms:\n" +
        "  if @cond [show \"ok\"]\n" +
        "  if @cond [ ... ] else [ ... ]\n\n" +
        "If you want a value:\n" +
        "  var @x = when [@cond => \"ok\"; * => \"no\"]",
        "[",
        location()
      );
    }
  / IfKeyword _ !"[" {
      helpers.mlldError(
        "Invalid if syntax: expected a condition and a bracketed block.\n\n" +
        "Mental model: 'if' runs actions; 'when' returns values.\n\n" +
        "Valid forms:\n" +
        "  if @cond [action]\n" +
        "  if @cond [ ... ] else [ ... ]",
        "[",
        location()
      );
    }

IfElseBlock
  = _ "else" _ block:IfActionBlock { return block; }

IfActionBlock
  = "[" _ body:IfActionBlockBody _ "]" {
      const statements = body.statements || [];
      const returnStmt = body.returnStmt;
      const hasReturn = !!returnStmt;
      return hasReturn ? [...statements, returnStmt] : statements;
    }
  / "[" _ {
      const blockStart = peg$currPos;
      const captured = helpers.captureBracketContent(input, blockStart);
      if (!captured) return peg$FAILED;
      helpers.reparseBlock({
        parse: peg$parse,
        SyntaxErrorClass: peg$SyntaxError,
        text: captured.content,
        startRule: 'IfActionBlockBody',
        baseLocation: peg$computeLocation(blockStart, blockStart),
        grammarSource: options.grammarSource,
        mode: options.mode
      });
    }
  / "[" _ &{
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
        "Unterminated block in if directive. Expected ']' to close the block.",
        "]",
        location()
      );
    }

IfActionBlockBody "if action block body"
  = statements:IfActionBlockStatementList firstReturn:(
      BlockStatementSeparator ret:IfActionBlockReturnStatement { return ret; }
    / _ ret:IfActionBlockReturnStatement { return ret; }
    )
    extraReturn:(BlockStatementSeparator IfActionBlockReturnStatement { return true; })?
    trailing:(BlockStatementSeparator IfActionBlockStatement { return true; })? {
      if (extraReturn) {
        helpers.mlldError(
          'Multiple return statements in if block. Only one return is allowed as the last statement.',
          'single return',
          location()
        );
      }
      if (trailing) {
        helpers.mlldError(
          'Return is the last statement in an if block.',
          'end of block',
          location()
        );
      }
      return {
        statements,
        returnStmt: firstReturn
      };
    }
  / statements:IfActionBlockStatementList {
      return {
        statements,
        returnStmt: null
      };
    }
  / leadingComments:LeadingBlockComment* _ ret:IfActionBlockReturnStatement {
      return {
        statements: [],
        returnStmt: ret
      };
    }

IfActionBlockReturnStatement "if block return statement"
  = "=>" _ value:ExeReturnValue? noise:BlockComments* {
      const normalized = typeof value === 'undefined' ? [] : (Array.isArray(value) ? value.flat() : [value]);
      return helpers.createNode('ExeReturn', {
        values: normalized,
        raw: text(),
        meta: {
          hasValue: normalized.length > 0
        },
        location: location()
      });
    }

IfActionBlockStatementList "if action block statement list"
  = leadingComments:LeadingBlockComment* _ first:IfActionBlockStatement rest:(BlockStatementSeparator stmt:IfActionBlockStatement { return stmt; })* trailing:BlockComments* {
      const normalize = (stmt) => Array.isArray(stmt) ? stmt.flat() : [stmt];
      const stmts = [...normalize(first), ...rest.flatMap(normalize)];
      if (leadingComments.length > 0 && stmts.length > 0) {
        const firstStmt = stmts[0];
        if (firstStmt && typeof firstStmt === 'object') {
          const existingMeta = firstStmt.meta || {};
          stmts[0] = {
            ...firstStmt,
            meta: {
              ...existingMeta,
              comment: existingMeta.comment || leadingComments[0],
              leadingComments: leadingComments
            }
          };
        }
      }
      return stmts;
    }
  / BlockComments+ { return []; }

IfActionBlockStatement "if action block statement"
  = IfVarInBlockError
  / LetAssignment
  / AugmentedAssignment
  / WhenExpressionAny
  / ForNestedDirective
  / SlashLoop
  / SlashIf
  / IfBlockAction

IfVarInBlockError
  = "var" _ {
      helpers.mlldError(
        '`var` cannot be used inside blocks — use `let` for block-scoped bindings',
        'let',
        location()
      );
    }

IfBlockAction
  = RunBlockAction
  / EffectAction
  / WhenRHSVarAssignment
  / WhenRHSCommandAction
  / WhenRHSFunctionCall
  / WhenRHSSkipAction
  / WhenRHSRetryAction
  / WhenRHSVariableReference
  / DoneLiteral
  / ContinueLiteral
  / ExeForeachPattern
  / ExeDataPattern
