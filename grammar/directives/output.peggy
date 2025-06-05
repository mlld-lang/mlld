// OUTPUT DIRECTIVE
// Implementation of the @output directive for routing output to various targets

// Main @output directive
AtOutput
  = DirectiveContext "@output" _ source:AtVar _ "to" _ target:OutputTarget format:(_ "as" _ f:OutputFormat { return f; })? {
      helpers.debug('AtOutput matched', { source, target, format });
      
      // Smart format detection from file extension if not explicit
      let detectedFormat = format;
      if (!detectedFormat && target.type === 'outputFile') {
        const pathStr = helpers.reconstructRawString(target.values);
        detectedFormat = helpers.detectFormatFromPath(pathStr);
      }
      
      const values = {
        source: source,
        target: target.values,
        ...(detectedFormat ? { format: [helpers.createNode(NodeType.Text, { content: detectedFormat, location: location() })] } : {})
      };
      
      const raw = {
        source: helpers.reconstructRawString([source]),
        target: target.raw,
        ...(detectedFormat ? { format: detectedFormat } : {})
      };
      
      const meta = {
        targetType: target.type,
        format: detectedFormat || 'text',  // Default to text
        explicitFormat: !!format  // Track if format was explicit
      };
      
      return helpers.createStructuredDirective(
        'output',
        target.type,  // outputResolver, outputFile, outputCommand
        values,
        raw,
        meta,
        location()
      );
    }

// Output target types
OutputTarget
  = ResolverOutputPath
  / FileOutputPath
  / CommandOutputPath

// Resolver path: @storage/reports/daily.json
ResolverOutputPath
  = "@" path:ResolverPath {
      return {
        type: 'outputResolver',
        values: path,
        raw: '@' + helpers.reconstructRawString(path)
      };
    }

// File output: file [./output.xml]
FileOutputPath
  = "file" _ path:WrappedPathContent {
      return {
        type: 'outputFile',
        values: path.values,
        raw: path.raw
      };
    }

// Command output: @run @uploadCommand
CommandOutputPath
  = "@run" _ cmd:AtVar {
      return {
        type: 'outputCommand',
        values: [cmd],
        raw: '@run ' + helpers.reconstructRawString([cmd])
      };
    }

// Resolver path segments
ResolverPath
  = first:BaseIdentifier rest:(PathSeparatorToken segment:BaseIdentifier { return [helpers.createNode(NodeType.Text, { content: segment, location: location() })]; })* {
      return [
        helpers.createNode(NodeType.Text, { content: first, location: location() }),
        ...rest.flat()
      ];
    }

// Output format options
OutputFormat
  = "markdown" { return "markdown"; }
  / "md" { return "markdown"; }
  / "text" { return "text"; }
  / "txt" { return "text"; }
  / "json" { return "json"; }
  / "xml" { return "xml"; }
  / "yaml" { return "yaml"; }
  / "yml" { return "yaml"; }
  / "csv" { return "csv"; }