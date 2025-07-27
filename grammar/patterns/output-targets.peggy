// OUTPUT TARGET PATTERNS
// Provides reusable patterns for @output directive targets
// Following semantic-first design: the directive chooses its parser

// OUTPUT TARGET - Main pattern for parsing output destinations
// Used by: @output directive
// Purpose: Unified pattern for all output target types
OutputTarget "output target"
  = OutputTargetStream
  / OutputTargetEnv
  / OutputTargetResolver
  / OutputTargetFile

// OUTPUT TARGET STREAM - Standard output streams
// Used by: OutputTarget
// Purpose: Matches stdout or stderr keywords
OutputTargetStream "stream target"
  = stream:("stdout" / "stderr") {
      helpers.debug('OutputTargetStream matched', { stream });
      return {
        type: 'stream',
        stream: stream,
        raw: stream
      };
    }

// OUTPUT TARGET ENV - Environment variable output
// Used by: OutputTarget
// Purpose: Matches env or env:VARNAME patterns
OutputTargetEnv "environment variable target"
  = "env" varname:(":" name:BaseIdentifier { return name; })? {
      helpers.debug('OutputTargetEnv matched', { varname });
      return {
        type: 'env',
        varname: varname || null,  // null means use default MLLD_VARIABLE pattern
        raw: varname ? `env:${varname}` : 'env'
      };
    }

// OUTPUT TARGET RESOLVER - Resolver-based output
// Used by: OutputTarget
// Purpose: Matches @resolver/path patterns
OutputTargetResolver "resolver target"
  = "@" resolver:BaseIdentifier path:ResolverPath? {
      helpers.debug('OutputTargetResolver matched', { resolver, path });
      return {
        type: 'resolver',
        resolver: resolver,
        path: path || [],
        raw: `@${resolver}${path ? '/' + path.map(p => p.content || '').join('/') : ''}`
      };
    }

// Resolver path - captures everything after the resolver name
ResolverPath
  = "/" chars:[^ \t\n\r]+ {
      const pathStr = chars.join('');
      return pathStr.split('/').filter(s => s).map(segment => ({
        type: 'Text',
        content: segment
      }));
    }

// OUTPUT TARGET FILE - File path output (default)
// Used by: OutputTarget, fallback for path-like content
// Purpose: Matches quoted, bracketed, or unquoted file paths
OutputTargetFile "file target"
  = path:OutputFilePath {
      helpers.debug('OutputTargetFile matched', { path });
      return {
        type: 'file',
        path: path.parts || path.values,
        raw: path.raw,
        meta: path.meta || {}
      };
    }

// OUTPUT FILE PATH - Flexible path parsing for output targets
// Allows quoted strings, bracketed paths, or unquoted paths
OutputFilePath "output file path"
  = str:DataString {
      // Handle both simple strings and interpolated content
      if (typeof str === 'string') {
        return {
          parts: [helpers.createNode(NodeType.Text, { content: str, location: location() })],
          raw: `"${str}"`,
          meta: { quoted: true }
        };
      } else if (str.needsInterpolation) {
        // Return the parts for runtime interpolation
        return {
          parts: str.parts,
          raw: helpers.reconstructRawString(str.parts),
          meta: { quoted: true, needsInterpolation: true }
        };
      }
    }
  // REMOVED: Bracket syntax - use quoted paths instead
  / chars:[^ \t\n\r"'\[\]]+ {
      const path = chars.join('');
      return {
        parts: [helpers.createNode(NodeType.Text, { content: path, location: location() })],
        raw: path,
        meta: { unquoted: true }
      };
    }

// OUTPUT FORMAT - Optional format specification
// Used by: @output directive
// Purpose: Matches 'as format' clause
OutputFormat "output format"
  = "as" _ format:BaseIdentifier {
      helpers.debug('OutputFormat matched', { format });
      return format;
    }

// Helper pattern for path segments in resolver targets
PathSegments
  = first:PathSegment rest:("/" segment:PathSegment { return segment; })* {
      return [first, ...rest];
    }

PathSegment
  = chars:[^/\s]+ {
      return {
        type: 'Text',
        content: chars.join('')
      };
    }