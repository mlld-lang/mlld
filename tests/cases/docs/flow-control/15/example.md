/exe @duplicate(item) = js { return [item, item.toUpperCase()]; }
/exe @flat(values) = js {
  if (!Array.isArray(values)) throw new Error('expected array input');
  return values.flat();
}

/var @names = ["one", "two"]
/var @result = foreach @duplicate(@names) => | @flat
/show @result