/exe @messageTemplate(user, action) = [[{{user}} {{action}} successfully!]]
/exe @getVersion = {echo "v1.2.3"}

/var @testAllFixes = {
message: @add @messageTemplate("Alice", "logged in"),
version: @run @getVersion,
nullable: null,
complex: {
greeting: @add @messageTemplate("Bob", "signed up"),
build: @run @getVersion,
empty: null,
flag: true
  }
}