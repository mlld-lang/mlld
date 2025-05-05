PathIdentifier
  = SpecialPathChar
  / [a-zA-Z_][a-zA-Z0-9_]* { return text(); }

SpecialPathIdentifier
  = "HOMEPATH" / "~" / "PROJECTPATH" / "." {
    return text();
  }

/**
 * Path Directive - @path identifier = "path_value"
 * Creates a structured path directive node with values and raw text
 */
PathDirective
  = "path" __ identifier:Identifier __ "=" __ path:(
      quotedPath:PathStringLiteral { 
        return { 
          parts: quotedPath,
          raw: helpers.reconstructRawString(quotedPath) 
        };
      }
    ) (LineTerminator / &EOF)
  {
    // Store raw text values for reconstruction
    const rawIdentifier = text().substring(5, text().indexOf('='));
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
      identifier: rawIdentifier.trim(),
      path: rawPath
    };
    
    // Create meta object with nested path metadata
    const meta = {
      path: pathMeta
    };
    
    // Create the structured directive node with 'path' as the source
    return helpers.createStructuredDirective('path', 'pathAssignment', values, raw, meta, location(), 'path');
  }

/**
 * Path Value - The right-hand side of a path assignment
 * Can be a string literal, interpolated string, or variable reference
 */
PathValue
  = interpolatedArray:InterpolatedStringLiteral { 
      // Return the structured array directly
      return interpolatedArray; 
    }
  / variable:PathVar {
    // Return an array containing the single VariableReference node
    return [helpers.createVariableReferenceNode('path', { identifier: variable.identifier }, location())]; 
  }
