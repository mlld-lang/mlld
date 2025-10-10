// FOREACH PATTERNS
// This file defines patterns for foreach functionality that can be used across
// multiple directives (data, text, add). Foreach enables iteration over arrays
// with parameterized commands or templates.

/* Import required patterns */

// -------------------------------------------------------------
// FOREACH COMMAND EXPRESSIONS
// -------------------------------------------------------------

// Main foreach command expression for iterating over arrays with parameterized commands
// Usage: foreach @command(@array1, @array2) 
// Creates cartesian product when multiple arrays provided
ForeachCommandExpression
  = "foreach" _ execInvocation:UnifiedReferenceWithTail batchPipe:ForeachBatchPipeline? withClause:ForeachWithClause? {
      helpers.debug('ForeachCommandExpression matched', { execInvocation, hasBatch: !!batchPipe, withClause });
      
      // Extract arrays from exec invocation arguments
      let arrays = [];
      if (execInvocation.type === 'ExecInvocation' && execInvocation.commandRef.args) {
        arrays = execInvocation.commandRef.args;
      }
      
      const withOptions = { ...(withClause || {}) };
      if (batchPipe) {
        withOptions.batchPipeline = batchPipe.pipeline;
        withOptions.isBatchPipeline = true;
      }

      return {
        type: "foreach-command",
        value: {
          type: 'foreach',
          execInvocation,
          arrays,
          ...(Object.keys(withOptions).length > 0 ? { with: withOptions } : {}),
          ...(batchPipe ? { batchPipeline: batchPipe } : {})
        },
        rawText: text(),
        ...(batchPipe ? { batchPipeline: batchPipe } : {})
      };
    }

ForeachBatchPipeline "foreach batch pipeline"
  = _ "=>" _ "||" _ firstParallel:ParallelSequence rest:PipelineRest* caps:PipelineParallelSpec? {
      const pipeline = [[...firstParallel], ...rest];
      helpers.debug('ForeachBatchPipeline matched (parallel)', {
        stageCount: pipeline.length,
        hasCaps: !!caps
      });
      return {
        pipeline,
        isBatchPipeline: true,
        ...(caps ? { parallel: caps.parallel, delayMs: caps.delayMs } : {})
      };
    }
  / _ "=>" _ "|" _ firstStage:PipelineStageFirst rest:PipelineRest* {
      const pipeline = [firstStage, ...rest];
      helpers.debug('ForeachBatchPipeline matched', {
        stageCount: pipeline.length
      });
      return {
        pipeline,
        isBatchPipeline: true
      };
    }


// List of array arguments separated by commas
// Each array will be iterated over, creating cartesian product for multiple arrays
ForeachArrayArgumentList
  = first:UnifiedVariableNoTail rest:(_ "," _ arr:UnifiedVariableNoTail { return arr; })* {
      return [first].concat(rest || []);
    }


// -------------------------------------------------------------
// FOREACH SECTION EXTRACTION (NEW PATTERN)
// -------------------------------------------------------------

// REMOVED: ForeachSectionExpression
// This pattern has been superseded by file reference interpolation
// Migration: Use <*.md # section> as "template" instead of foreach <@files # section> as "template"

// REMOVED: ForeachPathParts - no longer needed without ForeachSectionExpression


// -------------------------------------------------------------
// FOREACH WITH CLAUSE (OPTIONAL)
// -------------------------------------------------------------

// Optional with clause for foreach expressions
// Supports separator and template options for output formatting
ForeachWithClause
  = _ "with" _ "{" _ options:ForeachWithOptions _ "}" {
      return options;
    }

// With clause options for foreach
ForeachWithOptions
  = first:ForeachWithOption rest:(_ "," _ opt:ForeachWithOption { return opt; })* {
      const options = {};
      [first, ...rest].forEach(option => {
        options[option.key] = option.value;
      });
      return options;
    }

// Individual with clause option
ForeachWithOption
  = ForeachSeparatorOption
  / ForeachTemplateOption

// Separator option for joining foreach results
// Usage: separator: "delimiter"
ForeachSeparatorOption
  = "separator" _ ":" _ value:DataString {
      return { key: 'separator', value: value };
    }

// Template option for formatting foreach results  
// Usage: template: "format string"
ForeachTemplateOption
  = "template" _ ":" _ value:DataString {
      return { key: 'template', value: value };
    }
