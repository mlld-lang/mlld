// RUN ACTION PATTERN
// Shared run statement support for block bodies (exe/for).

RunBlockAction "run block action"
  = RunKeyword __ leading:LeadingParallelPipeline caps:PipelineParallelSpec? labelsSegment:(HWS DataLabelList)? comment:InlineComment? {
      helpers.debug('RunBlockAction matched leading parallel pipeline', { leading, caps });

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
  / RunKeyword __ "\"" command:$([^\"]*) "\"" tail:TailModifiers? labelsSegment:(HWS DataLabelList)? comment:InlineComment? {
      helpers.debug('RunBlockAction matched quoted command', { command, tail });

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
  / RunKeyword __ content:(CmdCommandBrackets / UnifiedCommandBrackets) tail:TailModifiers? labelsSegment:(HWS DataLabelList)? comment:InlineComment? {
      helpers.debug('RunBlockAction matched command', { content, tail });

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
  / RunKeyword __ stdinExpr:PipeStdinExpression _ "|" _ content:(CmdCommandBrackets / UnifiedCommandBrackets) tail:TailModifiers? labelsSegment:(HWS DataLabelList)? comment:InlineComment? {
      helpers.debug('RunBlockAction matched stdin pipe sugar', { stdinExpr, content, tail });

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
  / RunKeyword __ codeCore:(RunLanguageCodeWithArgs / RunLanguageCodeCore) tail:TailModifiers? labelsSegment:(HWS DataLabelList)? comment:InlineComment? {
      helpers.debug('RunBlockAction matched with language code pattern', { codeCore, tail });

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
  / RunKeyword __ commandRef:UnifiedReferenceWithTail labelsSegment:(HWS DataLabelList)? comment:InlineComment? {
      helpers.debug('RunBlockAction matched unified command reference', { commandRef });

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
