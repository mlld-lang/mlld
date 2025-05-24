# mlld Syntax Highlighting for Vim

This plugin provides syntax highlighting and filetype support for mlld files in Vim/Neovim.

## Features

- Syntax highlighting for all mlld directives (`@text`, `@data`, `@path`, `@run`, `@exec`, `@add`, `@import`)
- Variable highlighting and references
- Template interpolation with `{{variable}}` syntax
- Code block highlighting with language detection
- JSON syntax in `@data` directives
- Comment highlighting with `>>` prefix
- Smart indentation
- Folding support for code blocks and data structures
- Markdown syntax for regular content

## Installation

### Using vim-plug

Add this to your `.vimrc` or `init.vim`:

```vim
Plug 'meld-lang/meld', { 'rtp': 'editors/vim' }
```

Then run `:PlugInstall`

### Using Vundle

```vim
Plugin 'meld-lang/meld', { 'rtp': 'editors/vim' }
```

Then run `:PluginInstall`

### Using packer.nvim (Neovim)

```lua
use {
  'meld-lang/meld',
  rtp = 'editors/vim'
}
```

### Using lazy.nvim (Neovim)

```lua
{
  'meld-lang/meld',
  ft = { 'meld' },
  config = function()
    vim.opt.rtp:append(vim.fn.stdpath('data') .. '/lazy/meld/editors/vim')
  end
}
```

### Manual Installation

1. Copy the contents of this directory to your Vim configuration:

```bash
# For Vim
cp -r syntax ~/.vim/
cp -r ftdetect ~/.vim/
cp -r ftplugin ~/.vim/
cp -r indent ~/.vim/

# For Neovim
cp -r syntax ~/.config/nvim/
cp -r ftdetect ~/.config/nvim/
cp -r ftplugin ~/.config/nvim/
cp -r indent ~/.config/nvim/
```

## Usage

The plugin automatically activates for:
- `.mlld` and `.mld` files (always treated as mlld)
- `.md` files that contain mlld directives:
  - Only when lines start with: `@text`, `@data`, `@path`, `@run`, `@exec`, `@add`, or `@import`

### Manual Mode Switching

For markdown files, you can manually switch modes:
- `:MlldMode` - Force current buffer to use mlld syntax
- `:MarkdownMode` - Switch to standard Markdown syntax

### Key Features

1. **Syntax Highlighting**
   - Directives are highlighted as keywords
   - Variables are highlighted as identifiers
   - String values, numbers, and booleans have appropriate colors
   - Code blocks preserve their language-specific highlighting

2. **Indentation**
   - Automatic indentation for JSON objects and arrays
   - Smart indentation for templates and code blocks
   - Uses 2-space indentation (configurable)

3. **Folding**
   - Fold JSON objects and arrays with `za`, `zo`, `zc`
   - Fold code blocks
   - Set `foldlevel` to control initial folding

4. **Comments**
   - Use `>>` for line comments
   - Comment/uncomment with `gcc` (if using vim-commentary)

## Configuration

You can customize the behavior in your `.vimrc`:

```vim
" Change indent size
autocmd FileType meld setlocal shiftwidth=4 tabstop=4

" Disable folding
autocmd FileType meld setlocal nofoldenable

" Change fold level
autocmd FileType meld setlocal foldlevel=1
```

## Color Scheme Support

The plugin uses standard highlight groups that work with any color scheme:
- `Keyword` - Directives (@text, @data, etc.)
- `Identifier` - Variables
- `String` - String values and templates
- `Number` - Numeric values
- `Boolean` - true/false
- `Comment` - Comments with >>
- `Special` - Template interpolation brackets
- `Function` - Template names

## Examples

```meld
>> This is a comment

@text greeting = "Hello, World!"
@text message = [[Welcome {{user}}!]]

@data config = {
  "name": "MyApp",
  "version": "1.0.0",
  "enabled": true
}

@path root = @PROJECTPATH
@path dataFile = ./data/config.json

@run output = ```bash
echo "Building project..."
npm run build
```

@exec result = ```javascript
const sum = 1 + 2 + 3;
return sum;
```

@add template greet(name)
Hello {{name}}!

@add [examples/intro.md]
@add "Installation" from [docs/setup.md]

@import * from [config.mld]
@import {apiKey, dbUrl} from [secrets.mld]
```

## Troubleshooting

### Syntax highlighting not working

1. Ensure the file has a `.mld` or `.meld` extension
2. Check that syntax is enabled: `:syntax on`
3. Verify filetype is set: `:set filetype?` (should show `filetype=meld`)
4. Try manually setting: `:set filetype=meld`

### Indentation issues

1. Check indent settings: `:set shiftwidth? tabstop? expandtab?`
2. Ensure filetype indent is on: `:filetype indent on`

## Contributing

Feel free to submit issues or pull requests to improve the syntax highlighting or add new features!

## License

Same as the mlld project license.