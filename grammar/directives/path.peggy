PathIdentifier
  = SpecialPathChar
  / [a-zA-Z_][a-zA-Z0-9_]* { return text(); }

SpecialPathIdentifier
  = "HOMEPATH" / "~" / "PROJECTPATH" / "." {
    return text();
  }

/**
 * Path Directive - @path identifier = path_value
 * Creates a structured path directive node with values and raw text
 * Supports PathStyleInterpolation: quotes, brackets, or unquoted paths with @var interpolation
 */
PathDirective
  = "path" _ identifier:Identifier _ "=" _ path:WrappedPathContent (LineTerminator / &EOF)
  {
    // The @ prefix is already matched in the Directive rule in meld.peggy,
    // so this rule just matches "path" and the rest of the directive
    
    // Store raw text values for reconstruction
    // Extract just what this rule matched, not including the @ prefix
    const rawIdentifier = identifier;
    const rawPath = path.raw.trim();
    
    // Validate the path and get metadata
    const validatedPath = helpers.validatePath(path.parts, { context: 'pathDirective' });
    const pathMeta = {
      isAbsolute: validatedPath.isAbsolute,
      hasVariables: validatedPath.hasVariables,
      hasTextVariables: validatedPath.hasTextVariables,
      hasPathVariables: validatedPath.hasPathVariables,
      isRelative: validatedPath.isRelativeToCwd
    };
    
    // Create values object with node arrays
    const values = {
      identifier: [helpers.createVariableReferenceNode('identifier', { identifier })],
      path: validatedPath.values
    };
    
    // Create raw object with text segments
    const raw = {
      identifier: rawIdentifier,
      path: rawPath
    };
    
    // Create meta object with nested path metadata
    const meta = {
      path: pathMeta
    };
    
    // Create the structured directive node with 'path' as the source
    return helpers.createStructuredDirective('path', 'pathAssignment', values, raw, meta, location(), 'path');
  }

// Using WrappedPathContent from interpolation-patterns.peggy

// PathValue is now obsolete - replaced by the PathContent pattern from interpolation-patterns.peggy
