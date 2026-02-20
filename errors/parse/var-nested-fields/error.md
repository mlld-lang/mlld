Cannot use nested field syntax in var declarations. Variables in mlld are immutable - once defined, they cannot be extended with new fields.

If you want to create an object with multiple fields, define it all at once:
  var @${baseVar} = { ${fieldName}: <value>, ... }

Or define separate variables:
  var @${baseVar}_${flatName} = <value>
