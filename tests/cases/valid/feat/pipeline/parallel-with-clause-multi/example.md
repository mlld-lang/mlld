>> Parallel groups using JSON with-clause on an invocation

/exe @left(input) = `L:@input`
/exe @right(input) = `R:@input`
/exe @up(input) = `U:@input`
/exe @down(input) = `D:@input`
/exe @combine(input) = js {
  const arr = JSON.parse(input);
  return arr.join(' + ');
}

/exe @seed() = "x"

/show @seed() with { pipeline: [[@left, @right], @combine, [@up, @down], @combine] }

