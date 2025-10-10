/exe @duplicate(item) = js {
  return [item, item.toUpperCase()];
}
/exe @flat(text) = js {
  const parsed = JSON.parse(text);
  return parsed.flat();
}

/var @names = ["one", "two"]
/var @result = foreach @duplicate(@names) => | @flat
/show @result
