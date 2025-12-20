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

      if (value && value.content && value.wrapperType) {
        processedValue = value.content;
        if (processedValue.length === 0) {
          processedValue = [helpers.createNode(NodeType.Text, { content: '', location: loc })];
        }
        metaInfo.wrapperType = value.wrapperType;
        metaInfo.inferredType = 'template';

        if (value.withClause) {
          tail = tail ? Object.assign({}, value.withClause, tail) : value.withClause;
        }

        if (!value.withClause && tail && tail.pipeline) {
          const wrapper = value.wrapperType;
          const isTemplateWrapper = wrapper === 'backtick' || wrapper === 'doubleColon' || wrapper === 'tripleColon';
          if (isTemplateWrapper) {
            const filteredTail = { ...tail };
            delete filteredTail.pipeline;
            tail = filteredTail;
          }
        }
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
        processedValue = [value];
        metaInfo.inferredType = value.options && value.options.section ? 'section-content' : 'file-content';
        metaInfo.sourceType = value.source.type;
      }
      else if (value && (value.type === 'variableReference' || value.type === 'VariableReference')) {
        processedValue = [value];
        metaInfo.inferredType = 'reference';
      }
      else if (value && value.type === 'VariableReferenceWithTail') {
        processedValue = [value.variable];
        metaInfo.inferredType = 'reference';
        if (value.withClause) {
          tail = tail ? Object.assign({}, value.withClause, tail) : value.withClause;
        }
      }
      else if (value && value.type === 'LeadingParallelPipeline') {
        const placeholder = value.placeholder;
        processedValue = [placeholder];
        metaInfo.inferredType = 'pipeline';
        tail = tail ? Object.assign({}, value.withClause, tail) : value.withClause;
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
      else if (value && (value.type === 'BinaryExpression' || value.type === 'TernaryExpression' || value.type === 'UnaryExpression')) {
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

      if (value && value.content && value.wrapperType) {
        processedValue = value.content;
        if (processedValue.length === 0) {
          processedValue = [helpers.createNode(NodeType.Text, { content: '', location: loc })];
        }
        metaInfo.wrapperType = value.wrapperType;
        metaInfo.inferredType = 'template';

        if (value.withClause) {
          tail = tail ? Object.assign({}, value.withClause, tail) : value.withClause;
        }

        if (!value.withClause && tail && tail.pipeline) {
          const wrapper = value.wrapperType;
          const isTemplateWrapper = wrapper === 'backtick' || wrapper === 'doubleColon' || wrapper === 'tripleColon';
          if (isTemplateWrapper) {
            const filteredTail = { ...tail };
            delete filteredTail.pipeline;
            tail = filteredTail;
          }
        }
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
        processedValue = [value];
        metaInfo.inferredType = value.options && value.options.section ? 'section-content' : 'file-content';
        metaInfo.sourceType = value.source.type;
      }
      else if (value && (value.type === 'variableReference' || value.type === 'VariableReference')) {
        processedValue = [value];
        metaInfo.inferredType = 'reference';
      }
      else if (value && value.type === 'VariableReferenceWithTail') {
        processedValue = [value.variable];
        metaInfo.inferredType = 'reference';
        if (value.withClause) {
          tail = tail ? Object.assign({}, value.withClause, tail) : value.withClause;
        }
      }
      else if (value && value.type === 'LeadingParallelPipeline') {
        const placeholder = value.placeholder;
        processedValue = [placeholder];
        metaInfo.inferredType = 'pipeline';
        tail = tail ? Object.assign({}, value.withClause, tail) : value.withClause;
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
      else if (value && (value.type === 'BinaryExpression' || value.type === 'TernaryExpression' || value.type === 'UnaryExpression')) {
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
