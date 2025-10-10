/exe @identity(item) = js {
  return item;
}
/exe @sort(text) = js {
  const values = JSON.parse(text);
  return values.sort();
}

/var @letters = ["c", "a", "b"]
/show foreach @identity(@letters) => | @sort with { separator: ", " }
