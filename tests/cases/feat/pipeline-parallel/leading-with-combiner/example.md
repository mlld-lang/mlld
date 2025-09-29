/exe @func1() = "A"
/exe @func2() = "B"
/exe @func3() = "C"
/exe @combine(input) = js {
  const arr = JSON.parse(input);
  return arr.join(", ");
}

/var @result = || @func1() || @func2() || @func3() | @combine
/show @result