/exe @messageTemplate(user, action) = :::{{user}} {{action}} successfully!:::
/exe @getVersion = {echo "v1.2.3"}

/var @testAllFixes = {
message: @messageTemplate("Alice", "logged in"),
version: @getVersion(),
nullable: null,
complex: {
greeting: @messageTemplate("Bob", "signed up"),
build: @getVersion(),
empty: null,
flag: true
  }
}