" Vim filetype plugin file
" Language: MLLD

if exists("b:did_ftplugin")
  finish
endif
let b:did_ftplugin = 1

" Save and restore compatibility options
let s:save_cpo = &cpo
set cpo&vim

" Set comment format for >> style comments
setlocal commentstring=>>\ %s
setlocal comments=:>>

" Set tab/indent options (2 spaces like the project)
setlocal tabstop=2
setlocal shiftwidth=2
setlocal expandtab
setlocal autoindent

" Enable folding for code blocks and data structures
setlocal foldmethod=syntax
setlocal foldlevel=99

" Text width for markdown content
setlocal textwidth=80

" Format options
setlocal formatoptions-=t " Don't auto-wrap text
setlocal formatoptions+=croql " But do format comments nicely

" Match pairs for brackets
" Note: matchpairs only supports single characters, so we can't add [[ and ]]
setlocal matchpairs+=(:),{:},[:]

" Define patterns for the matchit plugin
if exists("loaded_matchit")
  let b:match_words = '@\(text\|data\|path\|run\|exec\):=,\[\[:]]:\[(:)]'
endif

" Commands for switching between mlld and Markdown
command! -buffer MlldMode setlocal filetype=mlld
command! -buffer MarkdownMode setlocal filetype=markdown

" Restore compatibility options
let &cpo = s:save_cpo
unlet s:save_cpo