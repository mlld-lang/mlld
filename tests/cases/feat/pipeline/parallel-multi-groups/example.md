>> Parallel with multiple groups and final combine

/exe @left(input) = `L:@input`
/exe @right(input) = `R:@input`
/exe @up(input) = `U:@input`
/exe @down(input) = `D:@input`
/exe @combine(input) = js {
  const arr = JSON.parse(input);
  return arr.join(' + ');
}

/exe @seed() = "x"

/var @out = @seed() | @left || @right | @combine | @up || @down | @combine
/show @out

