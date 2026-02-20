Executables cannot be defined with nested field syntax. Each executable must be defined at the top level with its own name.

Instead of:
  exe @${baseVar}${fields}${params} = ...

Use:
  exe @${methodName}${params} = ...

This keeps executables simple and clearly named.
