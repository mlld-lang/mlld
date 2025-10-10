/exe @wrap(x) = js {
  return [x, x * 2];
}
/exe @flat(values) = js {
  if (!Array.isArray(values)) {
    throw new Error('expected array input');
  }
  return values.flat().map(item => {
    const numeric = Number(item);
    return Number.isFinite(numeric) && `${numeric}` === String(item) ? numeric : item;
  });
}

/var @numbers = [1, 2, 3]
/var @pairs = for @n in @numbers => @wrap(@n) => | @flat
/show @pairs
