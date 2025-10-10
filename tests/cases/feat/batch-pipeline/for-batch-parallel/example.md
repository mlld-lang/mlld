/exe @stats(values) = js {
  if (!Array.isArray(values)) {
    throw new Error('expected array input');
  }
  return { count: values.length, first: values[0] };
}
/exe @sum(values) = js {
  if (!Array.isArray(values)) {
    throw new Error('expected array input');
  }
  return values.reduce((total, value) => total + Number(value), 0);
}

/var @nums = [1, 2, 3]
/var @result = for @n in @nums => @n => || @stats() || @sum()
/show @result
