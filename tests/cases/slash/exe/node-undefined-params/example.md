# Test Node.js Undefined Parameter Handling

/exe @greet(name, title, suffix) = node {
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

/exe @checkParams(a, b, c, d) = node {
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
/var @greeting1 = @greet("Alice", "Dr.", "PhD")
/show @greeting1

# Test case 2: Only required parameter
/var @greeting2 = @greet("Bob")
/show @greeting2

# Test case 3: Check parameter types
/var @params1 = @checkParams("first")
/show @params1

/var @params2 = @checkParams("one", "two")
/show @params2

/var @params3 = @checkParams("x", "y", "z", "w")
/show @params3