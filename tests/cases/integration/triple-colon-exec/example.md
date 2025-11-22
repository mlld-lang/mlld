/var @s1 = "foo"
/var @s2 = "bar"

/var @simple = :::Hello {{s1}}!:::
/var @multiline = :::
# Section1
{{s1}}

# Section2
{{s2}}
:::

# Direct display works correctly
/show "Direct display of simple template:"
/show @simple

/show "Direct display of multiline template:"
/show @multiline

# Pass to shell executable
/exe @echo_it(prompt) = cmd {echo "@prompt"}

/show "Echo simple template:"
/show @echo_it(@simple)

/show "Echo multiline template:"
/show @echo_it(@multiline)

# Pass to JavaScript executable
/exe @length(str) = js {
  return `Length: ${str.length}`;
}

/show "Length of simple template:"
/show @length(@simple)

# Pass to JavaScript that returns the value
/exe @identity(x) = js {
  return x;
}

/show "Identity function with template:"
/show @identity(@multiline)

# Test with undefined variables (should preserve {{var}} syntax)
/var @with_missing = :::Hello {{missingvar}}!:::
/show "Template with undefined variable:"
/show @with_missing
/show "Echo template with undefined variable:"
/show @echo_it(@with_missing)
