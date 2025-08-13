# Example: Mutation attempts in JavaScript

This demonstrates attempting to mutate variables in JavaScript blocks.

/var @counter = 0

/exe @incrementCounter() = js {
  @counter++;  // Error: can't mutate variables
  return @counter;
}

/exe @updateValue(val) = js {
  @total += val;  // Error: can't use compound assignment
  return @total;
}