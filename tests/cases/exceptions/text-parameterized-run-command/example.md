# Parameterized Text with Run Command (Invalid)

This example shows an invalid syntax where someone tries to create a parameterized text variable with a `@run` command.

/exec @codecat(dir) = @run {find @dir -type f -exec sh -c 'echo "<$(realpath --relative-to=@dir {})>"; cat {}; echo "@dir {})>"' \;}

This should fail because:
1. Parameterized text templates should use `@exec` not `@text`
2. The complex shell escaping may not be properly handled
3. There's malformed syntax at the end