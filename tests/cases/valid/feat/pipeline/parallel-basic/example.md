/exe @left(input) = `L:@input`
/exe @right(input) = `R:@input`
/exe @combine(input) = js {
  const arr = JSON.parse(input);
  return arr.join(' + ');
}

/exe @seed() = "x"
/var @out = @seed() | @left || @right | @combine
/show @out
