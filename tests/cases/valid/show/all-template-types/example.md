# Show All Template Types Test

/var @name = "World"
/var @greeting = "Hello"

## Single quotes (no interpolation)
/show 'Literal text with @name - no interpolation'

## Double quotes (with interpolation)
/show "Double quoted: @greeting, @name!"

## Backtick template (with interpolation)
/show `Backtick template: @greeting, @name!`

## Double bracket template (with curly braces interpolation)
/show :::Double bracket: {{greeting}}, {{name}}!:::