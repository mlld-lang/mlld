// OUTPUT DIRECTIVE
// Implementation of the /output directive for writing content to various targets

// TODO: Add tests for quoted path syntax once test infrastructure is in place
// See https://github.com/mlld-lang/mlld/issues/312
// The following syntax variations need test coverage:
// - /output "path.txt" (document output with quoted path)
// - /output @variable "path.txt" (variable output with quoted path)
// - /output @variable to "path.txt" (enhanced syntax with quoted path)

// Main /output directive - supports multiple forms:
// Legacy syntax (backward compatible):
// /output [file.md]                              <- outputs full document
// /output @variable [file.md]                    <- outputs variable content
// /output @template(args) [file.md]              <- outputs template result
// /output @command(args) [file.md]               <- outputs command result  
// /output "text content" [file.md]               <- outputs literal text
//
// New enhanced syntax:
// /output @variable to "path/to/file.md"         <- file output
// /output @variable to stdout                    <- standard output
// /output @variable to stderr                    <- standard error
// /output @variable to env                       <- environment variable (MLLD_VARIABLE)
// /output @variable to env:CUSTOM_NAME           <- custom environment variable
// /output @variable to @resolver/path/file.md    <- resolver output
// /output @variable to "file.json" as json       <- with format specification

SlashAppend
  = DirectiveContext "/append" _ source:OutputSource _ "to" _ target:OutputTargetFile format:(_ f:OutputFormat { return f; })? ending:StandardDirectiveEnding {
      helpers.debug('SlashAppend syntax matched', { source, target, format, ending });

      const values = {
        source: source.values,
        target
      };

      const raw = {
        source: source.raw,
        target: target.raw
      };

      const meta = {
        sourceType: source.type,
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
  / DirectiveContext "/append" _ OutputSource _ &{
      const rest = input.substring(peg$currPos).trim();
      return rest.length === 0 || rest.startsWith('\n');
    } {
      helpers.mlldError('Missing "to" keyword in /append directive. Use /append @var to "path".', 'to', location());
    }
  / DirectiveContext "/append" {
      helpers.mlldError('/append syntax error. Expected: /append @source to "path".', '@', location());
    }

SlashOutput
  // Support for simple quoted path syntax without source - MUST come first to avoid OutputLiteral matching
  // BUT don't match if followed by bracket (that's the literal+bracket syntax)
  // AND don't match if followed by "to" (that's the enhanced syntax)
  = DirectiveContext "/output" _ path:DataString !(_ "[") !(_ "to") ending:StandardDirectiveEnding {
      helpers.debug('SlashOutput quoted path without source matched', { path, ending });
      
      const values = {
        target: {
          type: 'file',
          path: [helpers.createNode(NodeType.Text, { content: path, location: location() })],
          raw: `"${path}"`,
          meta: { quoted: true }
        }
      };
      
      const raw = {
        target: `"${path}"`
      };
      
      const meta = {
        targetType: 'file',
        hasSource: false,
        legacy: true
      };
      
      // Apply unified pipeline processing
      helpers.processPipelineEnding(values, raw, meta, ending);
      
      return helpers.createStructuredDirective(
        'output',
        'outputDocument',
        values,
        raw,
        meta,
        location()
      );
    }
  // Main enhanced syntax with 'to' keyword
  / DirectiveContext "/output" _ source:OutputSource _ "to" _ target:OutputTarget format:(_ f:OutputFormat { return f; })? ending:StandardDirectiveEnding {
      helpers.debug('SlashOutput enhanced syntax matched', { source, target, format, ending });
      
      const values = {
        source: source.values,
        target: target
      };
      
      const raw = {
        source: source.raw,
        target: target.raw
      };
      
      const meta = {
        sourceType: source.type,
        targetType: target.type,
        hasSource: true,
        ...(format ? { format, explicitFormat: true } : {})
      };
      
      // Apply unified pipeline processing
      helpers.processPipelineEnding(values, raw, meta, ending);
      
      // Determine subtype based on target type
      let subtype = 'outputFile';  // default
      if (target.type === 'stream') {
        subtype = 'outputStream';
      } else if (target.type === 'env') {
        subtype = 'outputEnv';
      } else if (target.type === 'resolver') {
        subtype = 'outputResolver';
      }
      
      return helpers.createStructuredDirective(
        'output',
        subtype,
        values,
        raw,
        meta,
        location()
      );
    }
  // REMOVED: Legacy bracket syntax - use quoted paths instead
  // Support for quoted path syntax with source (legacy) - for syntax like: /output @var "file.txt"
  // BUT don't match if followed by bracket (that would be invalid syntax anyway)
  // AND don't match if followed by "to" (that's the enhanced syntax)
  / DirectiveContext "/output" _ source:OutputSource _ path:DataString !(_ "[") !(_ "to") ending:StandardDirectiveEnding {
      helpers.debug('SlashOutput quoted path with source matched', { source, path, ending });
      
      const values = {
        source: source.values,
        target: {
          type: 'file',
          path: [helpers.createNode(NodeType.Text, { content: path, location: location() })],
          raw: `"${path}"`,
          meta: { quoted: true }
        }
      };
      
      const raw = {
        source: source.raw,
        target: `"${path}"`
      };
      
      const meta = {
        sourceType: source.type,
        targetType: 'file',
        hasSource: true,
        quoted: true
      };
      
      // Apply unified pipeline processing
      helpers.processPipelineEnding(values, raw, meta, ending);
      
      return helpers.createStructuredDirective(
        'output',
        'outputFile',
        values,
        raw,
        meta,
        location()
      );
    }
  // REMOVED: Legacy bracket syntax without source - use quoted paths instead
  // New enhanced syntax for document output
  / DirectiveContext "/output" _ "to" _ target:OutputTarget format:(_ f:OutputFormat { return f; })? ending:StandardDirectiveEnding {
      helpers.debug('SlashOutput enhanced syntax without source matched', { target, format, ending });
      
      const values = {
        target: target
      };
      
      const raw = {
        target: target.raw
      };
      
      const meta = {
        targetType: target.type,
        hasSource: false,
        ...(format ? { format, explicitFormat: true } : {})
      };
      
      // Apply unified pipeline processing
      helpers.processPipelineEnding(values, raw, meta, ending);
      
      // Determine subtype based on target type
      let subtype = 'outputDocument';
      if (target.type !== 'file') {
        subtype = 'output' + target.type.charAt(0).toUpperCase() + target.type.slice(1);
      }
      
      return helpers.createStructuredDirective(
        'output',
        subtype,
        values,
        raw,
        meta,
        location()
      );
    }
    
  // Error Recovery Rules for /output directive
  // ------------------------------------------
  
  // Error: Missing 'to' keyword in enhanced syntax
  // But allow quoted paths without 'to' (they're handled by earlier rules)
  / DirectiveContext "/output" _ OutputSource _ &{
      // Look ahead to see if there's a target but no 'to'
      const rest = input.substring(peg$currPos).trim();
      // Check if next content looks like a target OTHER than quotes (quotes are valid without 'to')
      return rest.startsWith('stdout') || 
             rest.startsWith('stderr') || rest.startsWith('env') || rest.startsWith('@');
    } {
      helpers.mlldError("Missing 'to' keyword in /output directive. Expected: /output @variable to \"path\"", "to", location());
    }
    
  // Error: Missing target after 'to'
  / DirectiveContext "/output" _ OutputSource _ "to" _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing target in /output directive. Expected path, stdout, stderr, or env after 'to'.", "path", location());
    }
    
  // Error: Missing target after 'to' (without source)
  / DirectiveContext "/output" _ "to" _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing target in /output directive. Expected path, stdout, stderr, or env after 'to'.", "path", location());
    }
    
  // Error: Unclosed quoted path
  / DirectiveContext "/output" _ OutputSource _ "to" _ "\"" &{
      return helpers.detectMissingQuoteClose(input, peg$currPos, '"');
    } {
      helpers.mlldError("Unclosed quoted path in /output directive. Expected closing double quote (\").", "\"", location());
    }
    
  // REMOVED: Bracket syntax error handling - brackets no longer supported
    
  // Error: Invalid format specification
  / DirectiveContext "/output" _ OutputSource _ "to" _ OutputTarget _ "as" _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing format in /output directive. Expected format type after 'as' (e.g., json, xml, csv).", "format", location());
    }
    
  // Error: Invalid @ usage
  / DirectiveContext "/output" _ "@" &{
      const nextChar = input[peg$currPos];
      return !/[a-zA-Z_]/.test(nextChar);
    } {
      helpers.mlldError("Invalid variable reference in /output directive. Variable names must start with a letter or underscore.", "identifier", location());
    }
    
  // Error: Missing content after /output
  / DirectiveContext "/output" _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing content in /output directive. Expected source or target specification.", "@", location());
    }
    
  // Error: Invalid environment variable syntax
  / DirectiveContext "/output" _ OutputSource _ "to" _ "env:" &{
      // Check if there's no variable name after env:
      const rest = input.substring(peg$currPos).trim();
      return rest.length === 0 || /[^A-Z0-9_]/.test(rest[0]);
    } {
      helpers.mlldError("Invalid environment variable name in /output directive. Expected: env:VARIABLE_NAME", "VARIABLE_NAME", location());
    }
    
  // Error: Generic /output syntax error (catch-all)
  / DirectiveContext "/output" {
      helpers.mlldError("Invalid /output syntax. Expected: /output @variable to \"path\", /output \"path\", or /output @variable to stdout/stderr/env. Note: String literals cannot be used as output sources. To output text content, first assign it to a variable: /var @content = \"your text\", then use: /output @content to \"file.txt\"", "@", location());
    }

// -------------------------------------------------------------
// LOG DIRECTIVE - Syntactic sugar for /output to stdout
// -------------------------------------------------------------
// Implementation: Produces exact same AST as /output @x to stdout
// Issue: https://github.com/mlld-lang/mlld/issues/357

SlashLog
  // Log with source - /log @variable or /log @template(args)
  = DirectiveContext "/log" _ source:OutputSource format:(_ f:OutputFormat { return f; })? ending:StandardDirectiveEnding {
      helpers.debug('SlashLog with source matched', { source, format, ending });
      
      // Create stderr target automatically (policy: logs -> stderr)
      const stdoutTarget = {
        type: 'stream',
        stream: 'stderr',
        raw: 'stderr'
      };
      
      // Create exact same AST structure as /output @x to stdout
      const values = {
        source: source.values,
        target: stdoutTarget
      };
      
      const raw = {
        source: source.raw,
        target: 'stderr'
      };
      
      const meta = {
        sourceType: source.type,
        targetType: 'stream',  
        hasSource: true,
        isLogSugar: true,  // Mark for debugging/tracing
        ...(format ? { format, explicitFormat: true } : {})
      };
      
      // Apply unified pipeline processing
      helpers.processPipelineEnding(values, raw, meta, ending);
      
      return helpers.createStructuredDirective(
        'output',  // CRITICAL: Use 'output' kind, not 'log'
        'outputStream',
        values,
        raw,
        meta,
        location()
      );
    }
  // Document output variant (no source) - /log
  / DirectiveContext "/log" format:(_ f:OutputFormat { return f; })? ending:StandardDirectiveEnding {
      helpers.debug('SlashLog without source matched', { format, ending });
      
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
      
      const meta = {
        targetType: 'stream',
        hasSource: false,
        isLogSugar: true,
        ...(format ? { format, explicitFormat: true } : {})
      };
      
      // Apply unified pipeline processing
      helpers.processPipelineEnding(values, raw, meta, ending);
      
      return helpers.createStructuredDirective(
        'output',
        'outputStream',
        values,
        raw,
        meta,
        location()
      );
    }
    
  // Error Recovery Rules for /log directive
  // -----------------------------------------
  
  // Error: Missing content after /log
  / DirectiveContext "/log" _ &(LineTerminator / EOF) {
      helpers.mlldError("Missing content in /log directive. Expected variable or content to log.", "@", location());
    }
    
  // Error: Invalid @ usage
  / DirectiveContext "/log" _ "@" &{
      const nextChar = input[peg$currPos];
      return !/[a-zA-Z_]/.test(nextChar);
    } {
      helpers.mlldError("Invalid variable reference in /log directive. Variable names must start with a letter or underscore.", "identifier", location());
    }
    
  // Error: Generic /log syntax error (catch-all)
  / DirectiveContext "/log" {
      helpers.mlldError("Invalid /log syntax. Expected: /log @variable or /log (for document output). /log is syntactic sugar for /output to stdout.", "@", location());
    }

// Output source types
// OutputSource patterns are now imported from the shared output-sources module
// This provides consistent output source handling across all directive contexts


// Legacy argument patterns removed - use UnifiedArgumentList directly where needed
