/exe @sum(values) = js {
  if (!Array.isArray(values)) {
    throw new Error('expected array input');
  }
  return values.reduce((total, value) => total + Number(value), 0);
}

/var @values = [1, 2, 3, 4]
/var @total = for @v in @values => @v => | @sum
/show @total
