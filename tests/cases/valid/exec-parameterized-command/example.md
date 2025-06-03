# Parameterized Exec Command (Valid)

This example shows the correct way to create a parameterized command using `@exec`.

@exec codecat(dir) = @run [(find @dir -type f -name "*.js" -exec cat {} \;)]

@run @codecat("./src")