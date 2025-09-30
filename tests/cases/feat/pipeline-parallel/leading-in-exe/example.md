/exe @helper1() = "H1"
/exe @helper2() = "H2"
/exe @combine(input) = js {
  const arr = JSON.parse(input);
  return arr.join("");
}

/exe @composed() = || @helper1() || @helper2() | @combine
/show @composed()