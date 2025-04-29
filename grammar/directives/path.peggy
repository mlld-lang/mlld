PathIdentifier
  = SpecialPathChar
  / [a-zA-Z_][a-zA-Z0-9_]* { return text(); }

SpecialPathIdentifier
  = "HOMEPATH" / "~" / "PROJECTPATH" / "." {
    return text();
  }

PathDirective
  = "path" __ id:Identifier __ "=" __ rhs:( // rhs captures the { identifier, path } object
      pathStr:PathStringLiteral { // Case 1: Path String
        // pathStr is an array of nodes
        const pathObject = helpers.validatePath(pathStr, { context: 'pathDirective' });
        // Return the directive data structure
        return { identifier: id, path: pathObject };
      }
  )
  (
    DirectiveEOL          /* newline + returns Newline node */
    / &EOF                  /* or just end of file, returns nothing */
  )
  { 
    // rhs now holds { identifier, path }, create the directive node
    return helpers.createDirective('path', rhs, location()); 
  }

PathValue
  = interpolatedArray:InterpolatedStringLiteral { 
      // Return the structured array directly
      return interpolatedArray; 
    }
  / variable:PathVar {
    // Return an array containing the single VariableReference node
    return [helpers.createVariableReferenceNode('path', { identifier: variable.identifier }, location())]; 
  }
