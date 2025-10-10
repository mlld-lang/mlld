/exe @left(input) = `L:@input`
/exe @right(input) = `R:@input`
/exe @combine(input) = js {
  // Parallel stage returns a JSON array string
  const [l, r] = JSON.parse(input);
  return `${l} | ${r}`;
}

/var @out = "seed" with { pipeline: [ @left || @right, @combine ] }
/show @out