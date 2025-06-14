@exec messageTemplate(user, action) = [[{{user}} {{action}} successfully!]]
@exec getVersion = @run [(echo "v1.2.3")]

@data testAllFixes = {
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