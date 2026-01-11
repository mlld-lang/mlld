// RUN DIRECTIVE
// Implementation of the /run directive for executing commands and code

/* 
# Run Directive

The run directive executes shell commands, code blocks, or references to exec-defined variables.
It can be used in three main forms:
1. /run command-string        - Execute a shell command
2. /run language [code-block] - Execute a code block in the specified language
3. /run @commandVariable      - Execute a previously defined command/code reference
*/

// Core content handlers (context, tokens, whitespace, variables, command, code)
// are automatically included by the build process - no imports needed

// -------------------------------------------------------------
// TOP-LEVEL RUN DIRECTIVE
// -------------------------------------------------------------

RunKeyword
  = "/"? "run"

// Primary /run directive - Supporting both command and code syntax
// Order matters: most specific patterns first
SlashRun
  = DirectiveContext RunKeyword _ leading:LeadingParallelPipeline caps:PipelineParallelSpec? labelsSegment:(HWS DataLabelList)? comment:InlineComment? {
      helpers.debug('SlashRun matched leading parallel pipeline', { leading, caps });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;

      const pipeline = leading.withClause.pipeline || [];
      const withClause = {
        pipeline,
        ...(caps ? { parallel: caps.parallel, delayMs: caps.delayMs } : {})
      };

      const values = {
        withClause
      };
      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
      }

      const raw = {
        pipeline: pipeline.map(p => Array.isArray(p)
          ? `[${p.map(c => c.rawIdentifier).join(' || ')}]`
          : p.rawIdentifier
        ).join(' | ')
      };
      if (labelInfo) {
        raw.securityLabels = labelInfo.raw;
      }

      const meta = {
        isPipeline: true,
        hasLeadingParallel: true,
        stageCount: pipeline.length,
        ...(comment ? { comment } : {})
      };
      if (labelInfo) {
        meta.securityLabels = labelInfo.labels;
      }

      return helpers.createStructuredDirective(
        'run',
        'runPipeline',
        values,
        raw,
        meta,
        location(),
        'pipeline'
      );
    }
  / DirectiveContext RunKeyword _ "\"" command:$([^\"]*) "\"" tail:TailModifiers? labelsSegment:(HWS DataLabelList)? comment:InlineComment? {
      helpers.debug('SlashRun matched quoted command', { command, tail });

      const commandLocation = location();
      const parts = helpers.parseCommandContent(command, commandLocation);

      const commandBases = [];
      const rawBases = [];

      if (parts.length > 0 && parts[0].type === NodeType.Text) {
        const cmdMatch = parts[0].content.match(/^(\S+)/);
        if (cmdMatch) {
          commandBases.push(helpers.createNode(NodeType.CommandBase, {
            command: cmdMatch[1],
            location: location()
          }));
          rawBases.push(cmdMatch[1]);
        }
      }

      const values = {
        command: parts,
        commandBases
      };
      const raw = {
        command,
        commandBases: rawBases
      };
      const meta = {
        isMultiLine: false,
        commandCount: commandBases.length,
        hasScriptRunner: false,
        ...(comment ? { comment } : {})
      };

      if (tail) {
        values.withClause = tail;
        raw.withClause = tail;
        meta.withClause = tail;
      }

      const labelInfo = labelsSegment ? labelsSegment[1] : null;
      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
        raw.securityLabels = labelInfo.raw;
        meta.securityLabels = labelInfo.labels;
      }

      const endingInfo = {
        tail: tail && tail.pipeline ? { pipeline: tail.pipeline } : null,
        parallel: null,
        comment: comment || null
      };

      if (endingInfo.tail || endingInfo.comment) {
        helpers.processPipelineEnding(values, raw, meta, endingInfo);
      }

      return helpers.createStructuredDirective(
        'run',
        'runCommand',
        values,
        raw,
        meta,
        location(),
        'command'
      );
    }
  / DirectiveContext RunKeyword _ content:(CmdCommandBrackets / UnifiedCommandBrackets) tail:TailModifiers? labelsSegment:(HWS DataLabelList)? comment:InlineComment? {
      helpers.debug('SlashRun matched command', { content, tail });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;

      const values = content.values;
      const raw = content.raw;
      const meta = {
        ...content.meta,
        ...(comment ? { comment } : {})
      };

      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
        raw.securityLabels = labelInfo.raw;
        meta.securityLabels = labelInfo.labels;
      }

      if (tail) {
        values.withClause = tail;
        raw.withClause = tail;
        meta.withClause = tail;
      }

      const endingInfo = {
        tail: tail && tail.pipeline ? { pipeline: tail.pipeline } : null,
        parallel: null,
        comment: comment || null
      };

      if (endingInfo.tail || endingInfo.comment) {
        helpers.processPipelineEnding(values, raw, meta, endingInfo);
      }

      return helpers.createStructuredDirective(
        'run',
        content.subtype,
        values,
        raw,
        meta,
        location(),
        content.type
      );
    }
  / DirectiveContext RunKeyword _ stdinExpr:PipeStdinExpression _ "|" _ content:(CmdCommandBrackets / UnifiedCommandBrackets) tail:TailModifiers? labelsSegment:(HWS DataLabelList)? comment:InlineComment? {
      helpers.debug('SlashRun matched stdin pipe sugar', { stdinExpr, content, tail });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;

      const values = content.values;
      const raw = content.raw;
      const meta = {
        ...content.meta,
        ...(comment ? { comment } : {})
      };

      const withClause = {
        stdin: stdinExpr,
        ...(tail || {})
      };

      values.withClause = withClause;
      raw.withClause = withClause;
      meta.withClause = withClause;

      const endingInfo = {
        tail: tail && tail.pipeline ? { pipeline: tail.pipeline } : null,
        parallel: null,
        comment: comment || null
      };

      if (endingInfo.tail || endingInfo.comment) {
        helpers.processPipelineEnding(values, raw, meta, endingInfo);
      }

      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
        raw.securityLabels = labelInfo.raw;
        meta.securityLabels = labelInfo.labels;
      }

      return helpers.createStructuredDirective(
        'run',
        content.subtype,
        values,
        raw,
        meta,
        location(),
        content.type
      );
    }
  / DirectiveContext RunKeyword _ codeCore:(RunLanguageCodeWithArgs / RunLanguageCodeCore) tail:TailModifiers? labelsSegment:(HWS DataLabelList)? comment:InlineComment? {
      helpers.debug('SlashRun matched with language code pattern', { codeCore, tail });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;

      const values = codeCore.values;
      const raw = codeCore.raw;
      const meta = {
        ...codeCore.meta,
        ...(comment ? { comment } : {})
      };

      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
        raw.securityLabels = labelInfo.raw;
        meta.securityLabels = labelInfo.labels;
      }

      if (tail) {
        values.withClause = tail;
        raw.withClause = tail;
        meta.withClause = tail;
      }

      const endingInfo = {
        tail: tail && tail.pipeline ? { pipeline: tail.pipeline } : null,
        parallel: null,
        comment: comment || null
      };

      if (endingInfo.tail || endingInfo.comment) {
        helpers.processPipelineEnding(values, raw, meta, endingInfo);
      }

      return helpers.createStructuredDirective(
        'run',
        'runCode',
        values,
        raw,
        meta,
        location(),
        'code'
      );
    }
  / DirectiveContext RunKeyword _ commandRef:UnifiedReferenceWithTail labelsSegment:(HWS DataLabelList)? comment:InlineComment? {
      helpers.debug('SlashRun matched unified command reference', { commandRef });

      const labelInfo = labelsSegment ? labelsSegment[1] : null;

      let values, raw, meta;

      if (commandRef.type === 'ExecInvocation') {
        const isExecResultMethod = commandRef.commandRef && commandRef.commandRef.objectSource;
        if (isExecResultMethod) {
          values = {
            execInvocation: commandRef
          };
        } else {
          values = {
            identifier: commandRef.commandRef.identifier,
            args: commandRef.commandRef.args || []
          };
        }

        let rawIdentifier = commandRef.commandRef.name;
        if (commandRef.commandRef.identifier && commandRef.commandRef.identifier.length > 0) {
          const varRef = commandRef.commandRef.identifier[0];
          if (varRef.type === NodeType.VariableReference) {
            rawIdentifier = varRef.identifier;
            if (varRef.fields && varRef.fields.length > 0) {
              rawIdentifier += varRef.fields.map(f => '.' + f.value).join('');
            }
          }
        }

        raw = {
          identifier: rawIdentifier,
          args: commandRef.commandRef.args ? commandRef.commandRef.args.map(arg =>
            arg.type === NodeType.Text ? arg.content :
            arg.type === NodeType.VariableReference ? '@' + arg.identifier : ''
          ) : []
        };
        meta = {
          argumentCount: commandRef.commandRef.args ? commandRef.commandRef.args.length : 0,
          ...(comment ? { comment } : {})
        };

        if (commandRef.withClause) {
          values.withClause = commandRef.withClause;
          raw.withClause = commandRef.withClause;
          meta.withClause = commandRef.withClause;
        }
      } else if (commandRef.type === 'VariableReferenceWithTail') {
        values = {
          identifier: [commandRef.variable],
          args: []
        };
        raw = {
          identifier: commandRef.variable.identifier,
          args: []
        };
        meta = {
          argumentCount: 0,
          ...(comment ? { comment } : {})
        };

        if (commandRef.withClause) {
          values.withClause = commandRef.withClause;
          raw.withClause = commandRef.withClause;
          meta.withClause = commandRef.withClause;
        }
      } else {
        values = {
          identifier: [commandRef],
          args: []
        };
        raw = {
          identifier: commandRef.identifier,
          args: []
        };
        meta = {
          argumentCount: 0,
          ...(comment ? { comment } : {})
        };
      }

      if (labelInfo) {
        values.securityLabels = labelInfo.labels;
        raw.securityLabels = labelInfo.raw;
        meta.securityLabels = labelInfo.labels;
      }

      const subtype = (commandRef.type === 'ExecInvocation' && (commandRef.commandRef && commandRef.commandRef.objectSource))
        ? 'runExecInvocation'
        : 'runExec';

      const endingInfo = {
        tail: null,
        parallel: null,
        comment: comment || null
      };

      helpers.processPipelineEnding(values, raw, meta, endingInfo);

      return helpers.createStructuredDirective(
        'run',
        subtype,
        values,
        raw,
        meta,
        location(),
        'exec'
      );
    }
// Error Recovery Rules for /run directive
  // ----------------------------------------
  
  // Error: Unclosed quoted command
  / DirectiveContext RunKeyword _ "\"" &{
      return helpers.detectMissingQuoteClose(input, peg$currPos, '"');
    } {
      helpers.mlldError("Unclosed quoted command in /run directive. Expected closing double quote (\").", "\"", location());
    }
    
  // Error: Unclosed bracket command
  / DirectiveContext RunKeyword _ "{" &{
      return helpers.isUnclosedObject(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed command brackets in /run directive. Expected closing brace for command.", String.fromCharCode(125), location());
    }
    
  // Error: Invalid syntax after language identifier - must check for NOT { or (
  / DirectiveContext RunKeyword _ lang:BaseIdentifier _ !"{" !"(" !LineTerminator !EOF &{
      // Only match if this is a valid language identifier
      const validLangs = ['js', 'javascript', 'node', 'python', 'py', 'bash', 'sh'];
      return validLangs.includes(lang.toLowerCase());
    } {
      helpers.mlldError("Invalid code syntax in /run directive. Expected code block or arguments after language identifier: " + lang, String.fromCharCode(123), location());
    }
    
  // Error: Missing code block after language
  / DirectiveContext RunKeyword _ lang:BaseIdentifier _ &(LineTerminator / EOF) &{
      const validLangs = ['js', 'javascript', 'node', 'python', 'py', 'bash', 'sh'];
      return validLangs.includes(lang.toLowerCase());
    } {
      helpers.mlldError("Missing code block in /run directive. Expected code block after language: " + lang, String.fromCharCode(123), location());
    }
    
  // Error: Invalid @ usage (not followed by valid identifier)
  / DirectiveContext RunKeyword _ "@" &{
      const nextChar = input[peg$currPos];
      return !/[a-zA-Z_]/.test(nextChar);
    } {
      helpers.mlldError("Invalid exec reference in /run directive. Variable names must start with a letter or underscore.", "identifier", location());
    }
    
  // Error: Missing content after /run
  / DirectiveContext RunKeyword _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing content in /run directive. Expected command, code block, or exec reference.", String.fromCharCode(123), location());
    }
    
  // Error: Unclosed code block
  / DirectiveContext RunKeyword _ lang:BaseIdentifier _ "(" [^)]* ")" _ "{" &{
      // Check if we have an unclosed code block after language (args)
      return helpers.isUnclosedObject(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed code block in /run directive. Expected closing brace for " + lang + " code.", String.fromCharCode(125), location());
    }
    
  // Error: Unclosed code block without args
  / DirectiveContext RunKeyword _ lang:BaseIdentifier _ "{" &{
      // Check if we have an unclosed code block after language
      return helpers.isUnclosedObject(input, peg$currPos);
    } {
      helpers.mlldError("Unclosed code block in run directive. Expected closing brace for " + lang + " code.", String.fromCharCode(125), location());
    }

  // Error: Generic run syntax error (catch-all)
  / DirectiveContext RunKeyword {
      helpers.mlldError("Invalid run syntax. Expected: run cmd {command}, run language {code}, or run @exec", String.fromCharCode(123));
    }

// -------------------------------------------------------------
// RUN DIRECTIVE FOR RHS CONTEXTS
// -------------------------------------------------------------

// Run directive reference in RHS contexts (nested in other directives)
RunDirectiveRef
  = codeCore:(RunLanguageCodeWithArgs / RunLanguageCodeCore) {
      // Language + code syntax in RHS: language {code} or language (args) {code}
      helpers.debug('RunDirectiveRef matched language + code in RHS', { codeCore });
      
      // Use values and raw from the core pattern
      const values = codeCore.values;
      const raw = codeCore.raw;
      
      // Merge metadata
      const meta = {
        ...codeCore.meta,
        isRHSRef: true
      };
      
      return helpers.createStructuredDirective(
        'run',
        'runCode',
        values,
        raw,
        meta,
        location(),
        'code'
      );
    }
  / commandRef:UnifiedReferenceNoTail {
      // @ detected -> Command reference (exec) in RHS
      helpers.debug('RunDirectiveRef matched unified exec reference in RHS', { commandRef });
      
      // Handle both ExecInvocation and VariableReference types from unified patterns
      let values, raw, meta;
      
      if (commandRef.type === 'ExecInvocation') {
        values = {
          identifier: commandRef.commandRef.identifier,
          args: commandRef.commandRef.args || []
        };
        
        // Construct the full identifier path for raw
        let rawIdentifier = commandRef.commandRef.name;
        if (commandRef.commandRef.identifier && commandRef.commandRef.identifier.length > 0) {
          const varRef = commandRef.commandRef.identifier[0];
          if (varRef.type === NodeType.VariableReference) {
            rawIdentifier = varRef.identifier;
            if (varRef.fields && varRef.fields.length > 0) {
              rawIdentifier += varRef.fields.map(f => '.' + f.value).join('');
            }
          }
        }
        
        raw = {
          identifier: rawIdentifier,
          args: commandRef.commandRef.args ? commandRef.commandRef.args.map(arg => 
            arg.type === NodeType.Text ? arg.content : 
            arg.type === NodeType.VariableReference ? '@' + arg.identifier : ''
          ) : []
        };
        meta = {
          argumentCount: commandRef.commandRef.args ? commandRef.commandRef.args.length : 0,
          isRHSRef: true
        };
      } else {
        // Plain variable reference
        values = {
          identifier: [commandRef],
          args: []
        };
        raw = {
          identifier: commandRef.identifier,
          args: []
        };
        meta = {
          argumentCount: 0,
          isRHSRef: true
        };
      }
      
      return helpers.createStructuredDirective(
        'run',
        'runExec',
        values,
        raw,
        meta,
        location(),
        'exec'
      );
    }
  / content:(CmdCommandBrackets / UnifiedCommandBrackets) {
      helpers.debug('RunDirectiveRef matched command in RHS', { content });

      return helpers.createStructuredDirective(
        'run',
        content.subtype,
        content.values,
        content.raw,
        {
          ...content.meta,
          isRHSRef: true
        },
        location()
      );
    }

// -------------------------------------------------------------
// HELPER RULES
// -------------------------------------------------------------


// Legacy patterns removed - use UnifiedArgumentList directly where needed
