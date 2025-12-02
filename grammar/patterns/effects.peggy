// EFFECTS PATTERN
// Unified pattern for effect actions (show, log, output, append)
// Used by: WhenRHSAction, ForSingleAction
// Purpose: Ensure all effects are available in the same RHS contexts

// Main effects pattern - matches any effect action
EffectAction "effect action"
  = EffectShowAction
  / EffectLogAction
  / EffectOutputAction
  / EffectAppendAction

// Show effect - emits to both stdout and document, returns value
// Uses the helper function for consistent handling with ForSingleAction
EffectShowAction
  = "show" _ content:WhenRHSShowContent ending:StandardDirectiveEnding {
      helpers.debug('EffectShowAction matched', { content, ending });
      // Use createForActionNode for consistent handling with pipelines
      return helpers.createForActionNode('show', content, location(), ending ? ending.tail : null);
    }

// Log effect - emits to stderr only, no return value
EffectLogAction
  = "log" _ source:EffectSourceContent? {
      const stdoutTarget = {
        type: 'stream',
        stream: 'stderr',
        raw: 'stderr'
      };

      const values = {
        target: stdoutTarget
      };

      const raw = {
        target: 'stderr'
      };

      let subtype = 'outputStream';
      const meta = {
        hasSource: false,
        targetType: 'stream',
        isLogSugar: true
      };

      if (source) {
        if (source && typeof source === 'object' && source.wrapperType) {
          values.source = source.content;
          raw.source = source.raw || text();
          meta.sourceType = 'literal';
          meta.wrapperType = source.wrapperType;
        } else if (source && source.type === 'VariableReference') {
          values.source = {
            identifier: [source],
            args: []
          };
          raw.source = '@' + source.identifier;
          meta.sourceType = 'variable';
        } else if (source && source.type === 'ExecInvocation') {
          values.source = {
            identifier: source.commandRef.identifier,
            args: source.commandRef.args || []
          };
          raw.source = source.commandRef.name;
          meta.sourceType = 'execInvocation';
        } else {
          values.source = [helpers.createNode(NodeType.Text, { content: String(source), location: location() })];
          raw.source = String(source);
          meta.sourceType = 'literal';
        }
        meta.hasSource = true;
      }

      return helpers.createNode(NodeType.Directive, {
        kind: 'output',
        subtype: subtype,
        values: values,
        raw: raw,
        meta: meta,
        location: location()
      });
    }

// Output effect - writes to file or stream
EffectOutputAction
  = "output" _ source:EffectSourceContent? _ "to" _ target:OutputTarget format:(_ "as" _ f:OutputFormat { return f; })? {
      helpers.debug('EffectOutputAction matched', { source, target, format });

      const values = { target };
      const raw = { target: target.raw || String(target) };
      let subtype = 'outputDocument';
      const meta = {
        hasSource: false,
        targetType: target.type || 'file',
        enhanced: true
      };

      if (source) {
        meta.hasSource = true;

        if (source && typeof source === 'object' && source.wrapperType) {
          values.source = source.content;
          raw.source = source.raw || text();
          meta.sourceType = 'literal';
          meta.wrapperType = source.wrapperType;
          subtype = 'outputText';
        } else if (source && source.type === 'VariableReference') {
          values.source = {
            identifier: [source],
            args: []
          };
          raw.source = '@' + source.identifier;
          meta.sourceType = 'variable';
          subtype = 'outputVariable';
        } else if (source && source.type === 'ExecInvocation') {
          values.source = {
            identifier: source.commandRef.identifier,
            args: source.commandRef.args || []
          };
          raw.source = source.commandRef.name;
          meta.sourceType = 'execInvocation';
          subtype = 'outputInvocation';
        } else {
          values.source = [helpers.createNode(NodeType.Text, { content: String(source), location: location() })];
          raw.source = String(source);
          meta.sourceType = 'literal';
          subtype = 'outputText';
        }
      }

      if (format) {
        meta.format = format;
      }

      return helpers.createNode(NodeType.Directive, {
        kind: 'output',
        subtype,
        values,
        raw,
        meta,
        location: location()
      });
    }

// Append effect - appends to file (JSONL or plain text)
EffectAppendAction
  = "append" _ source:EffectSourceContent _ "to" _ target:OutputTargetFile format:(_ f:OutputFormat { return f; })? ending:StandardDirectiveEnding {
      // Build source structure matching OutputSource format expected by append evaluator
      let sourceValues, sourceRaw, sourceType;

      if (source && typeof source === 'object' && source.wrapperType) {
        // Template/quoted content
        sourceValues = source.content;
        sourceRaw = source.raw || text();
        sourceType = 'literal';
      } else if (source && source.type === 'VariableReference') {
        // Variable reference - wrap in structure matching OutputSource
        sourceValues = {
          identifier: [source],
          args: []
        };
        sourceRaw = '@' + source.identifier;
        sourceType = 'variable';
      } else if (source && source.type === 'ExecInvocation') {
        // Exec invocation
        sourceValues = {
          identifier: source.commandRef.identifier,
          args: source.commandRef.args || []
        };
        sourceRaw = source.commandRef.name;
        sourceType = 'execInvocation';
      } else {
        // Literal value
        sourceValues = [helpers.createNode(NodeType.Text, { content: String(source), location: location() })];
        sourceRaw = String(source);
        sourceType = 'literal';
      }

      const values = {
        source: sourceValues,
        target
      };

      const raw = {
        source: sourceRaw,
        target: target.raw
      };

      const meta = {
        sourceType: sourceType,
        targetType: 'file',
        hasSource: true,
        ...(format ? { format, explicitFormat: true } : {})
      };

      helpers.processPipelineEnding(values, raw, meta, ending);

      return helpers.createStructuredDirective(
        'append',
        'appendFile',
        values,
        raw,
        meta,
        location()
      );
    }

// Source content for effects - templates, variables, invocations, primitives
EffectSourceContent
  = UnifiedQuoteOrTemplate
  / WhenExpression
  / UnifiedReference
  / DataObjectLiteral
  / PrimitiveValue

// Show content for effects - supports templates, references with tails, and primitives
WhenRHSShowContent
  = UnifiedQuoteOrTemplate
  / UnifiedReference
  / DataObjectLiteral
  / PrimitiveValue
