# JS Nested Variable Unwrap

/var @a = ["one", "two"]
/var @b = ["three", "four"]

/exe @flatten(arrays) = js {
  return JSON.stringify({
    outerIsArray: Array.isArray(arrays),
    innerIsArray: arrays.every(x => Array.isArray(x)),
    flat: arrays.flat().join(",")
  });
}

/show @flatten([@a, @b])
