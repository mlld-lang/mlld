// LOCAL ASSIGNMENT PATTERNS
// =========================
// Used in: when block entries (/when, /exe...when, /guard...when)
// Purpose: Local variable declarations and mutations scoped to the when block
//
// Patterns:
//   let @varName = value   - Creates a new local variable
//   @varName += value      - Augmented assignment (array concat, string append, object merge)

// LET ASSIGNMENT - Create a new local variable
// Syntax: let @varName = value
LetAssignment "let assignment"
  = "let" __ "@" id:BaseIdentifier _ "=" _ value:VarRHSContent ending:SecuredDirectiveEnding {
      let tail = ending.tail;
      const comment = ending.comment;
      const loc = location();
      let processedValue;
      let metaInfo = {};

      const mergeWithClause = (existing, incoming) => {
        if (!existing) return incoming || null;
        if (!incoming) return existing;

        const merged = Object.assign({}, existing, incoming);
        if (existing.pipeline || incoming.pipeline) {
          merged.pipeline = [
            ...(Array.isArray(existing.pipeline) ? existing.pipeline : []),
            ...(Array.isArray(incoming.pipeline) ? incoming.pipeline : [])
          ];
        }
        return merged;
      };

      const convertCondensedPipes = (pipes) => {
        if (!Array.isArray(pipes) || pipes.length === 0) return [];

        return pipes.map((pipe) => {
          const transform = typeof pipe?.transform === 'string'
            ? pipe.transform
            : (typeof pipe?.rawIdentifier === 'string' ? pipe.rawIdentifier : '');

          const dotted = transform.split('.').filter(Boolean);
          const baseIdentifier = dotted[0] || transform;
          const explicitFields = Array.isArray(pipe?.fields) ? pipe.fields : [];
          const fieldTokens = explicitFields.length > 0
            ? explicitFields.map(field => typeof field === 'string'
              ? { type: 'field', value: field }
              : field)
            : dotted.slice(1).map(field => ({ type: 'field', value: field }));

          const identifier = helpers.createVariableReferenceNode('varIdentifier', {
            identifier: baseIdentifier,
            ...(fieldTokens.length > 0 ? { fields: fieldTokens } : {})
          }, location());

          const args = Array.isArray(pipe?.args) ? pipe.args : [];

          return {
            identifier: [identifier],
            args,
            fields: fieldTokens,
            rawIdentifier: transform,
            rawArgs: args
          };
        });
      };

      if (value && value.content && value.wrapperType) {
        processedValue = value.content;
        if (processedValue.length === 0) {
          processedValue = [helpers.createNode(NodeType.Text, { content: '', location: loc })];
        }
        metaInfo.wrapperType = value.wrapperType;
        metaInfo.inferredType = 'template';

        if (value.withClause) {
          tail = mergeWithClause(value.withClause, tail);
        }
        // Note: Pipeline is preserved for all wrapper types (backtick, doubleColon, tripleColon)
        // to allow `let @x = \`template\` | log` syntax to work consistently
      }
      else if (value && value.type === 'object') {
        processedValue = [value];
        metaInfo.inferredType = 'object';
      }
      else if (value && value.type === 'array') {
        processedValue = [value];
        metaInfo.inferredType = 'array';
        metaInfo.isEmptyArray = value.items.length === 0;
      }
      else if (value && value.type === 'load-content') {
        let normalizedLoadValue = value;
        if (Array.isArray(value.pipes) && value.pipes.length > 0 && Array.isArray(tail?.pipeline)) {
          tail = mergeWithClause({ pipeline: convertCondensedPipes(value.pipes) }, tail);
          normalizedLoadValue = { ...value };
          delete normalizedLoadValue.pipes;
        }
        processedValue = [normalizedLoadValue];
        metaInfo.inferredType = value.options && value.options.section ? 'section-content' : 'file-content';
        metaInfo.sourceType = value.source.type;
      }
      else if (value && (value.type === 'variableReference' || value.type === 'VariableReference')) {
        let normalizedVarValue = value;
        if (Array.isArray(value.pipes) && value.pipes.length > 0 && Array.isArray(tail?.pipeline)) {
          tail = mergeWithClause({ pipeline: convertCondensedPipes(value.pipes) }, tail);
          normalizedVarValue = { ...value };
          delete normalizedVarValue.pipes;
        }
        processedValue = [normalizedVarValue];
        metaInfo.inferredType = 'reference';
      }
      else if (value && value.type === 'VariableReferenceWithTail') {
        processedValue = [value.variable];
        metaInfo.inferredType = 'reference';
        if (value.withClause) {
          tail = mergeWithClause(value.withClause, tail);
        }
      }
      else if (value && value.type === 'LeadingParallelPipeline') {
        const placeholder = value.placeholder;
        processedValue = [placeholder];
        metaInfo.inferredType = 'pipeline';
        tail = mergeWithClause(value.withClause, tail);
      }
      else if (value && value.type === 'nestedDirective') {
        processedValue = [value.directive];
        metaInfo.inferredType = 'computed';
        metaInfo.isDataValue = true;
      }
      else if (value && value.type === 'code') {
        processedValue = [{
          type: 'code',
          language: value.language,
          code: value.code
        }];
        metaInfo.inferredType = 'computed';
        metaInfo.language = value.language;
        metaInfo.hasRunKeyword = value.hasRunKeyword;
      }
      else if (value && value.type === 'command') {
        processedValue = [{
          type: 'command',
          command: value.command
        }];
        metaInfo.inferredType = 'computed';
        metaInfo.hasRunKeyword = value.hasRunKeyword;
      }
      else if (value && value.type === 'foreach-command') {
        processedValue = [value.value];
        metaInfo.inferredType = 'computed';
        metaInfo.isForeach = true;
      }
      else if (value && (value.type === 'BinaryExpression' || value.type === 'TernaryExpression' || value.type === 'UnaryExpression' || value.type === 'CoerceExpression')) {
        processedValue = [value];
        metaInfo.inferredType = 'expression';
        metaInfo.expressionType = value.type;
      }
      else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        processedValue = [value];
        metaInfo.inferredType = 'primitive';
        metaInfo.primitiveType = value === null ? 'null' : typeof value;
      }
      else {
        processedValue = Array.isArray(value) ? value : [value];
        metaInfo.inferredType = 'unknown';
      }

      if (comment) {
        metaInfo.comment = comment;
      }

      const nodeInit = {
        identifier: id,
        value: processedValue,
        location: loc
      };

      if (tail) {
        nodeInit.withClause = tail;
        metaInfo.withClause = tail;
      }

      if (Object.keys(metaInfo).length > 0) {
        nodeInit.meta = metaInfo;
      }

      return helpers.createNode('LetAssignment', nodeInit);
    }

// AUGMENTED ASSIGNMENT - Modify an existing local variable
// Syntax: @varName += value (also accepts leading 'let @varName +=' for block contexts)
// Supports: arrays (concat), strings (append), objects (shallow merge)
AugmentedAssignment "augmented assignment"
  = ("let" __)? ComplexAugmentedLHS "+=" _ value:VarRHSContent ending:SecuredDirectiveEnding {
      helpers.mlldError(
        'ETOOCOMPLEX: Augmented assignment only supports simple variables. Use: let @variable += value',
        '@variable',
        location()
      );
    }
  / ("let" __)? "@" id:BaseIdentifier _ "+=" _ value:VarRHSContent ending:SecuredDirectiveEnding {
      let tail = ending.tail;
      const comment = ending.comment;
      const loc = location();
      let processedValue;
      let metaInfo = {};

      const mergeWithClause = (existing, incoming) => {
        if (!existing) return incoming || null;
        if (!incoming) return existing;

        const merged = Object.assign({}, existing, incoming);
        if (existing.pipeline || incoming.pipeline) {
          merged.pipeline = [
            ...(Array.isArray(existing.pipeline) ? existing.pipeline : []),
            ...(Array.isArray(incoming.pipeline) ? incoming.pipeline : [])
          ];
        }
        return merged;
      };

      const convertCondensedPipes = (pipes) => {
        if (!Array.isArray(pipes) || pipes.length === 0) return [];

        return pipes.map((pipe) => {
          const transform = typeof pipe?.transform === 'string'
            ? pipe.transform
            : (typeof pipe?.rawIdentifier === 'string' ? pipe.rawIdentifier : '');

          const dotted = transform.split('.').filter(Boolean);
          const baseIdentifier = dotted[0] || transform;
          const explicitFields = Array.isArray(pipe?.fields) ? pipe.fields : [];
          const fieldTokens = explicitFields.length > 0
            ? explicitFields.map(field => typeof field === 'string'
              ? { type: 'field', value: field }
              : field)
            : dotted.slice(1).map(field => ({ type: 'field', value: field }));

          const identifier = helpers.createVariableReferenceNode('varIdentifier', {
            identifier: baseIdentifier,
            ...(fieldTokens.length > 0 ? { fields: fieldTokens } : {})
          }, location());

          const args = Array.isArray(pipe?.args) ? pipe.args : [];

          return {
            identifier: [identifier],
            args,
            fields: fieldTokens,
            rawIdentifier: transform,
            rawArgs: args
          };
        });
      };

      if (value && value.content && value.wrapperType) {
        processedValue = value.content;
        if (processedValue.length === 0) {
          processedValue = [helpers.createNode(NodeType.Text, { content: '', location: loc })];
        }
        metaInfo.wrapperType = value.wrapperType;
        metaInfo.inferredType = 'template';

        if (value.withClause) {
          tail = mergeWithClause(value.withClause, tail);
        }
        // Note: Pipeline is preserved for all wrapper types (backtick, doubleColon, tripleColon)
        // to allow `let @x = \`template\` | log` syntax to work consistently
      }
      else if (value && value.type === 'object') {
        processedValue = [value];
        metaInfo.inferredType = 'object';
      }
      else if (value && value.type === 'array') {
        processedValue = [value];
        metaInfo.inferredType = 'array';
        metaInfo.isEmptyArray = value.items.length === 0;
      }
      else if (value && value.type === 'load-content') {
        let normalizedLoadValue = value;
        if (Array.isArray(value.pipes) && value.pipes.length > 0 && Array.isArray(tail?.pipeline)) {
          tail = mergeWithClause({ pipeline: convertCondensedPipes(value.pipes) }, tail);
          normalizedLoadValue = { ...value };
          delete normalizedLoadValue.pipes;
        }
        processedValue = [normalizedLoadValue];
        metaInfo.inferredType = value.options && value.options.section ? 'section-content' : 'file-content';
        metaInfo.sourceType = value.source.type;
      }
      else if (value && (value.type === 'variableReference' || value.type === 'VariableReference')) {
        let normalizedVarValue = value;
        if (Array.isArray(value.pipes) && value.pipes.length > 0 && Array.isArray(tail?.pipeline)) {
          tail = mergeWithClause({ pipeline: convertCondensedPipes(value.pipes) }, tail);
          normalizedVarValue = { ...value };
          delete normalizedVarValue.pipes;
        }
        processedValue = [normalizedVarValue];
        metaInfo.inferredType = 'reference';
      }
      else if (value && value.type === 'VariableReferenceWithTail') {
        processedValue = [value.variable];
        metaInfo.inferredType = 'reference';
        if (value.withClause) {
          tail = mergeWithClause(value.withClause, tail);
        }
      }
      else if (value && value.type === 'LeadingParallelPipeline') {
        const placeholder = value.placeholder;
        processedValue = [placeholder];
        metaInfo.inferredType = 'pipeline';
        tail = mergeWithClause(value.withClause, tail);
      }
      else if (value && value.type === 'nestedDirective') {
        processedValue = [value.directive];
        metaInfo.inferredType = 'computed';
        metaInfo.isDataValue = true;
      }
      else if (value && value.type === 'code') {
        processedValue = [{
          type: 'code',
          language: value.language,
          code: value.code
        }];
        metaInfo.inferredType = 'computed';
        metaInfo.language = value.language;
        metaInfo.hasRunKeyword = value.hasRunKeyword;
      }
      else if (value && value.type === 'command') {
        processedValue = [{
          type: 'command',
          command: value.command
        }];
        metaInfo.inferredType = 'computed';
        metaInfo.hasRunKeyword = value.hasRunKeyword;
      }
      else if (value && value.type === 'foreach-command') {
        processedValue = [value.value];
        metaInfo.inferredType = 'computed';
        metaInfo.isForeach = true;
      }
      else if (value && (value.type === 'BinaryExpression' || value.type === 'TernaryExpression' || value.type === 'UnaryExpression' || value.type === 'CoerceExpression')) {
        processedValue = [value];
        metaInfo.inferredType = 'expression';
        metaInfo.expressionType = value.type;
      }
      else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        processedValue = [value];
        metaInfo.inferredType = 'primitive';
        metaInfo.primitiveType = value === null ? 'null' : typeof value;
      }
      else {
        processedValue = Array.isArray(value) ? value : [value];
        metaInfo.inferredType = 'unknown';
      }

      if (comment) {
        metaInfo.comment = comment;
      }

      const nodeInit = {
        identifier: id,
        operator: '+=',
        value: processedValue,
        location: loc
      };

      if (tail) {
        nodeInit.withClause = tail;
        metaInfo.withClause = tail;
      }

      if (Object.keys(metaInfo).length > 0) {
        nodeInit.meta = metaInfo;
      }

      return helpers.createNode('AugmentedAssignment', {
        ...nodeInit
      });
    }

ComplexAugmentedLHS
  = "@" BaseIdentifier _? ("." / "[") (!("+=" / "=>") .)* &"+="

// Combined pattern for when entries that need local assignment
LocalAssignment "local assignment"
  = LetAssignment
  / AugmentedAssignment
