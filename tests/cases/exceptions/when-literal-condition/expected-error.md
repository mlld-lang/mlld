/when directive requires a variable reference, not a literal value.
Use a variable instead:
   @when true => ...  (incorrect)
   @text condition = "true"
   @when @condition => ...  (correct)

For switch-style conditions with literal values, use:
   @when @variable: [
true => ...
false => ...
   ]