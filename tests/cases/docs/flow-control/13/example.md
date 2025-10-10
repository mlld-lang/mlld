/exe @wrap(x) = js { return [x, x * 2]; }
/exe @flat(text) = js {
  const values = JSON.parse(text);
  return values.flat();
}

/var @pairs = for @x in [1, 2, 3] => @wrap(@x) => | @flat
/show @pairs