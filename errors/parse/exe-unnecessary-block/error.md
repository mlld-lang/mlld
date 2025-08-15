mlld expressions in /exe don't use block syntax

Found: /exe @${FUNC}(${PARAMS}) = { ${BODY} }

/exe functions don't use curly braces.

Examples:
✓ /exe @greet(name) = show "Hello @name"
✓ /exe @fetch() = run {curl api.com}
✓ /exe @pick(val) = when first [
    @val > 0 => "positive"
    * => "negative"
  ]