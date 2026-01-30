# mlld Syntax Highlighting for Vim/Neovim

Regex-based syntax highlighting for mlld files in Vim and Neovim.

For the best experience, use Neovim with the LSP server (see below).

## Features

- Syntax highlighting for all mlld directives (`var`, `show`, `exe`, `run`, `for`, `when`, `guard`, `import`, `export`, etc.)
- Variable highlighting (`@name`, `@data.field`)
- Template syntax (backticks, `::`, `:::`)
- Comment highlighting (`>>` and `<<`)
- Operators (`=>`, `|`, `||`, `&&`, `==`, etc.)
- File references (`<file.md>`, `<*.ts>`)
- Embedded code blocks (`js { }`, `python { }`, `sh { }`)

## Installation

### Using lazy.nvim (Neovim - Recommended)

```lua
{
  'mlld-lang/mlld',
  ft = { 'mld', 'mlld' },
  config = function()
    vim.opt.rtp:append(vim.fn.stdpath('data') .. '/lazy/mlld/editors/vim')
  end
}
```

### Using vim-plug

```vim
Plug 'mlld-lang/mlld', { 'rtp': 'editors/vim' }
```

### Using packer.nvim

```lua
use {
  'mlld-lang/mlld',
  rtp = 'editors/vim'
}
```

### Manual Installation

```bash
# For Neovim
cp -r syntax ~/.config/nvim/
cp -r ftdetect ~/.config/nvim/
cp -r ftplugin ~/.config/nvim/
cp -r after ~/.config/nvim/

# For Vim
cp -r syntax ~/.vim/
cp -r ftdetect ~/.vim/
cp -r ftplugin ~/.vim/
cp -r after ~/.vim/
```

## LSP Support (Neovim 0.8+)

For semantic highlighting, autocomplete, and go-to-definition, configure the mlld language server:

```lua
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

if not configs.mlld_ls then
  configs.mlld_ls = {
    default_config = {
      cmd = {'mlld', 'language-server'},
      filetypes = {'mld', 'mlld'},
      root_dir = lspconfig.util.root_pattern('mlld.lock.json', '.git'),
    }
  }
end

lspconfig.mlld_ls.setup{}
```

Or use `mlld nvim-setup` to auto-configure.

## File Types

The plugin activates for:
- `.mld` files - Strict mode (bare directives)
- `.mld.md` files - Markdown mode (slash-prefixed directives)

## Examples

```mlld
>> This is a comment

var @name = "World"
var @data = <config.json>

exe @greet(n) = `Hello @n!`
exe @build() = cmd { npm run build }

for @file in <src/**/*.ts> => show @file.mx.relative

when [
  @data.enabled => show "Enabled"
  * => show "Disabled"
]
```

## Troubleshooting

### Syntax highlighting not working

1. Check file extension: `:echo &filetype` (should show `mld` or `mlld`)
2. Enable syntax: `:syntax on`
3. Manually set: `:set filetype=mld`

### LSP not working

1. Ensure mlld is installed: `mlld --version`
2. Check LSP status: `:LspInfo`
3. View logs: `:LspLog`
