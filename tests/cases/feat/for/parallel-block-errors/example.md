# Parallel block aggregates errors without aborting

/exe @maybeFail(item) = js {
  if (item === "b") throw new Error("boom:" + item);
  return item;
}

/for parallel(2) @item in ["a", "b", "c"] [
  let @x = @maybeFail(@item)
]

/show `errors:@ctx.errors.length`
/show `firstMessage:@ctx.errors[0].message`
/show `firstIndex:@ctx.errors[0].index`
