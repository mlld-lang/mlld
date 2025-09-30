/exe @a() = "A"
/exe @b() = "B"
/exe @join(input) = js {
  const arr = JSON.parse(input);
  return arr.join("-");
}
/exe @upper(input) = js { return input.toUpperCase(); }

/var @result = || @a() || @b() | @join | @upper
/show @result