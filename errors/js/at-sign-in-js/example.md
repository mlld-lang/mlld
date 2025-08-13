# Example: @ syntax in JavaScript blocks

This demonstrates the common mistake of using @variable syntax inside JavaScript code blocks.

/var @count = 0

/exe @increment() = js {
  // This will cause an error - can't use @ in JS
  const newValue = @count + 1;
  return newValue;
}