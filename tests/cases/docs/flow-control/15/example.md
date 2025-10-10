/exe @duplicate(item) = js { return [item, item.toUpperCase()]; }
/exe @flat(text) = js {
  const values = JSON.parse(text);
  return values.flat();
}

/var @names = ["one", "two"]
/var @result = foreach @duplicate(@names) => | @flat
/show @result