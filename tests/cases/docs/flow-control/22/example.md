/exe @wrap(x) = js { return [x, x * 2]; }
/exe @flat(values) = js {
  if (!Array.isArray(values)) throw new Error('expected array input');
  return values.flat();
}

/var @pairs = for @x in [1, 2, 3] => @wrap(@x) => | @flat
/show @pairs