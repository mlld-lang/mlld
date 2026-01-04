// STREAM DIRECTIVE
// Streams the output of an invocation with implicit with { stream: true }

StreamDirectiveKeyword
  = "/"? "stream"

SlashStream
  = DirectiveContext StreamDirectiveKeyword _ invocation:UnifiedReferenceWithTail ending:StandardDirectiveEnding {
      helpers.debug('SlashStream matched invocation', { invocation });

      const withClause = {
        stream: true,
        ...(invocation.withClause || {}),
        ...(ending?.tail || {})
      };

      const invocationWithStream = invocation && typeof invocation === 'object'
        ? { ...invocation, withClause }
        : invocation;

      const values = {
        invocation: invocationWithStream,
        withClause
      };

      const raw = {
        invocation: invocationWithStream,
        withClause
      };

      const meta = {
        withClause,
        isStreaming: true
      };

      if (ending) {
        helpers.processPipelineEnding(values, raw, meta, ending);
      }

      // Ensure stream flag persists after pipeline ending processing
      if (values.withClause && values.withClause.stream !== true) {
        values.withClause.stream = true;
      }
      if (raw.withClause && raw.withClause.stream !== true) {
        raw.withClause.stream = true;
      }
      if (meta.withClause && meta.withClause.stream !== true) {
        meta.withClause.stream = true;
      }

      // Keep invocation in sync
      return helpers.createStructuredDirective(
        DirectiveKind.stream,
        'showInvocation',
        values,
        raw,
        meta,
        location(),
        'stream'
      );
    }
