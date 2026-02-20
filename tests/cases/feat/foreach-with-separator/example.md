/exe @echo(item) = js {
  return item;
}
/var @colors = ["red", "green", "blue"]
/show foreach @echo(@colors) with {separator: " | "}
