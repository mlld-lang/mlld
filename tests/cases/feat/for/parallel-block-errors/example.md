# Parallel block aggregates errors without aborting

/exe @maybeFail(item) = js {
  if (item === "b") throw new Error("boom:" + item);
  return item;
}

/for parallel(2) @item in ["a", "b", "c"] [
  let @x = @maybeFail(@item)
]

/show `errors:@mx.errors.length`
/show `firstMessage:@mx.errors[0].message`
/show `firstIndex:@mx.errors[0].index`
