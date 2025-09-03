/exe @left(input) = `L:@input`
/exe @right(input) = `R:@input`
/exe @combine(input) = js {
  const arr = JSON.parse(input);
  return arr.join(' + ');
}

/exe @seed() = "x"

# Sugar form with ||
/var @out_sugar = @seed() | @left || @right | @combine
/show @out_sugar

# JSON-with form with nested array for parallel group
/var @out_with = @seed() with { pipeline: [[@left, @right], @combine] }
/show @out_with

