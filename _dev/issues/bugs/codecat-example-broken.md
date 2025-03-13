examples/imports.mld has the following:

```meld
@define codecat(dir) = @run [find {{dir}} -type f -exec sh -c 'echo "<$(realpath --relative-to={{dir}} {})>"; cat {}; echo "{{dir}} {})>"' \;]
```

examples/example.mld:

```meld
@run $codecat($./examples)
```

This isn't working. It produces an error that seems related to the path that's being passed in it.

The codecat example is fairly complex 