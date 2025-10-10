/exe @pair(a, b) = js {
  return a * b;
}
/exe @sum(values) = js {
  if (!Array.isArray(values)) {
    throw new Error('expected array input');
  }
  return values.reduce((total, value) => total + Number(value), 0);
}

/var @a = [1, 2]
/var @b = [3, 4]
/var @total = foreach @pair(@a, @b) => | @sum
/show @total
