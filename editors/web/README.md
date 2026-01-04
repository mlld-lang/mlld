# mlld Web Syntax Highlighting

Prism.js syntax highlighting for mlld, used by the mlld website and documentation.

## Files

- `prism-mlld.js` - Prism.js language definition for mlld

## Usage

```javascript
const Prism = require('prismjs');
require('./prism-mlld.js');

// Now Prism.languages.mlld is available
const html = Prism.highlight(code, Prism.languages.mlld, 'mlld');
```

## Regeneration

This file is auto-generated from `grammar/syntax-generator/build-syntax.js`:

```bash
npm run build:syntax:force
```

## Supported Features

- Directives (`var`, `show`, `exe`, `run`, `for`, `when`, etc.)
- Variables (`@name`, `@data.field`)
- Templates (backticks, `::`, `:::`)
- Comments (`>>`, `<<`)
- Operators (`=>`, `|`, `||`, `&&`, etc.)
- File references (`<file.md>`, `<src/**/*.ts>`)
- Object literals with keys
- Block syntax (`[...]` with `let`, `=>`)
