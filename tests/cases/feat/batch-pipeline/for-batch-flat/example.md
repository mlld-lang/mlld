/exe @wrap(x) = js {
  return [x, x * 2];
}
/exe @flat(text) = js {
  const parsed = JSON.parse(text);
  const flattened = parsed.flat();
  return flattened.map(item => {
    const numeric = Number(item);
    return Number.isFinite(numeric) && `${numeric}` === String(item) ? numeric : item;
  });
}

/var @numbers = [1, 2, 3]
/var @pairs = for @n in @numbers => @wrap(@n) => | @flat
/show @pairs
