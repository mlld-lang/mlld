" Vim syntax additions for Mlld in Markdown
" Place in after/syntax/markdown.vim

" Match Mlld directives at start of line in Markdown
syn match markdownMlldDirective "^@\(text\|data\|run\|add\|path\|import\|exec\|define\|embed\|url\)\>" nextgroup=markdownMlldLine
syn region markdownMlldLine start="." end="$" contained contains=mlldVariable,mlldTemplate,mlldPath,mlldString,mlldOperator,mlldNumber,mlldBoolean,mlldNull

" Link to Mlld syntax groups
hi def link markdownMlldDirective mlldDirective
