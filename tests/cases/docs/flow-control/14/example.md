/exe @sum(text) = js {
  const values = JSON.parse(text);
  return values.reduce((total, value) => total + Number(value), 0);
}

/var @total = for @n in [1, 2, 3, 4] => @n => | @sum
/show @total