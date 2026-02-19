# JS Array Unwrap

/var @items = ["alpha", "beta", "gamma"]

/exe @checkArray(arr) = js {
  return JSON.stringify({
    isArray: Array.isArray(arr),
    length: arr.length,
    first: arr[0],
    flat: [arr, ["delta"]].flat().join(","),
    mapped: arr.map(x => x.toUpperCase()).join(",")
  });
}

/show @checkArray(@items)
