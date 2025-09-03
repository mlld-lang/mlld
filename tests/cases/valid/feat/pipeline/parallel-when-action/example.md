>> Parallel group inside a /when action

/var @cond = true

/exe @left(input) = `L:@input`
/exe @right(input) = `R:@input`
/exe @combine(input) = js {
  const arr = JSON.parse(input);
  return arr.join(' + ');
}

/exe @seed() = "x"

/when @cond => show @seed() | @left || @right | @combine

