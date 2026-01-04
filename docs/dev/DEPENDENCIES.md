# mlld Module Dependencies Specification

## Overview

All mlld modules declare runtime dependencies with the `/needs` directive. This covers both runtimes (js/node/py/sh) and specific packages or commands.

## Dependency Declaration

### Required: `/needs` Directive

Declare runtime requirements inside the module with `/needs`:

```mlld
/needs {
  node: []
}
```

### Runtime Types

Supported runtime keys:

- `node` or `js` - JavaScript/Node.js
- `py` - Python
- `sh` - Shell access (boolean)

### Detailed Dependencies

Add package and command requirements directly to `/needs`.

#### JavaScript Dependencies

```mlld
/needs {
  node: [axios, lodash]
}
```

#### Python Dependencies

```mlld
/needs {
  py: [requests>=2.31.0, pandas]
}
```

#### Shell Dependencies

```mlld
/needs {
  sh
  cmd: [curl, jq, git]
}
```

## Examples

### Pure mlld Module

```mlld
/needs {}

@text upper(text) = :::{{text}}:::  # Would need JS for actual uppercase
@text join(a, b) = :::{{a}}{{b}}:::
```

### JavaScript Module

```mlld
/needs {
  node: [glob]
}

@exec parseJSON(text) = @run js [(JSON.parse(text))]
@exec stringify(obj) = @run js [(JSON.stringify(obj, null, 2))]
```

### Multi-Runtime Module

```mlld
/needs {
  node: [glob, fs-extra]
  sh
  cmd: [curl, jq]
}
```
