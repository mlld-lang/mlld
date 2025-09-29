/exe @a() = "A"
/exe @b() = "B"
/exe @combine(input) = js {
  const arr = JSON.parse(input);
  return arr.join(",");
}

>> Shorthand syntax
/var @result1 = || @a() || @b() | @combine

>> Longhand with-clause syntax (should produce same result)
/var @result2 = "" with { pipeline: [[@a, @b], @combine] }

/show @result1
/show @result2