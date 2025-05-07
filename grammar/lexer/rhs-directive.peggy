// Common patterns for right-hand side directive assignment

// A general rule for handling nested directives on the right side of assignments
NestedDirectiveRHS "Nested directive value"
  = "@" runDirective:RunDirective {
      return {
        type: "nestedDirective",
        directive: runDirective, // Store the complete directive node
        values: [], // Empty values since we're using the directive node directly
        rawText: "@run " + (runDirective.raw && runDirective.raw.command ? runDirective.raw.command : "")
      };
    }
  / "@" addDirective:AddDirective {
      return {
        type: "nestedDirective",
        directive: addDirective, // Store the complete directive node
        values: [], // Empty values since we're using the directive node directly
        rawText: "@add " + (addDirective.raw && addDirective.raw.path ? addDirective.raw.path : "")
      };
    }
  / "@" textDirective:TextDirective {
      return {
        type: "nestedDirective",
        directive: textDirective, // Store the complete directive node
        values: [], // Empty values since we're using the directive node directly
        rawText: "@text " + (textDirective.raw && textDirective.raw.content ? textDirective.raw.content : "")
      };
    }
  / "@" importDirective:ImportDirective {
      return {
        type: "nestedDirective",
        directive: importDirective, // Store the complete directive node
        values: [], // Empty values since we're using the directive node directly
        rawText: "@import " + (importDirective.raw && importDirective.raw.path ? importDirective.raw.path : "")
      };
    }
  / "@" dataDirective:DataDirective {
      return {
        type: "nestedDirective",
        directive: dataDirective, 
        values: [], 
        rawText: "@data " + (dataDirective.raw && dataDirective.raw.name ? dataDirective.raw.name : "")
      };
    }