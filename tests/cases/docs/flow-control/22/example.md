/exe @sum(values) = js {
  if (!Array.isArray(values)) throw new Error('expected array input');
  return values.reduce((total, value) => total + Number(value), 0);
}

/var @total = for @n in [1, 2, 3, 4] => @n => | @sum
/show @total