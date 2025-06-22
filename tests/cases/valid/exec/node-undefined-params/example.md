# Test Node.js Undefined Parameter Handling

/exec @greet(name, title, suffix) = node {}
  // Function that handles optional parameters
  let greeting = "Hello";
  
  if (title !== undefined) {
    greeting += ", " + title;
  }
  
  greeting += " " + name;
  
  if (suffix !== undefined) {
    greeting += " " + suffix;
  }
  
  return greeting + "!";
}

/exec @checkParams(a, b, c, d) = node {}
  // Test that all parameters are accessible even when undefined
  const results = [];
  
  // This would throw ReferenceError if parameters weren't declared
  results.push(`a: ${typeof a} = ${a}`);
  results.push(`b: ${typeof b} = ${b === undefined ? 'undefined' : b}`);
  results.push(`c: ${typeof c} = ${c === undefined ? 'undefined' : c}`);
  results.push(`d: ${typeof d} = ${d === undefined ? 'undefined' : d}`);
  
  return results.join(', ');
}

# Test case 1: All parameters provided
/data @greeting1 = @greet("Alice", "Dr.", "PhD")
/add @greeting1

# Test case 2: Only required parameter
/data @greeting2 = @greet("Bob")
/add @greeting2

# Test case 3: Check parameter types
/data @params1 = @checkParams("first")
/add @params1

/data @params2 = @checkParams("one", "two")
/add @params2

/data @params3 = @checkParams("x", "y", "z", "w")
/add @params3