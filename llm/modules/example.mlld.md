---
name: example
author: local
about: Example module from path alias
version: 1.0.0
needs: []
license: CC0
---

# @local/example

A sample module to demonstrate loading from a path alias.

## tldr

```mlld-run
/import { greeting, info } from @local/example

/show [[{{greeting}}]]
/show [[{{info}}]]
```

## export

```mlld-run
/var @greeting = "Hello from path alias!"
/var @info = "This module was loaded from a path alias"

>> All variables are automatically exported
```

## interface

### `greeting`

A friendly greeting message.

### `info`

Information about this module.
