/exe @primary() = "primary"
/exe @fallback() = js {
  throw new Error("fallback should not run");
}

/var @result = @primary() || @fallback()
/show @result
