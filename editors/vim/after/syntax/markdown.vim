" Vim syntax additions for Mlld in Markdown
" Place in after/syntax/markdown.vim

" Match Mlld directives at start of line in Markdown
syn match markdownMlldDirective "^@\(data\|text\|run\|add\|path\|import\|exec\|when\|output\)\>" nextgroup=markdownMlldLine
syn region markdownMlldLine start="." end="$" contained contains=mlldReservedVar,mlldVariable,mlldFieldAccess,mlldTemplate,mlldPath,mlldString,mlldOperator,mlldNumber,mlldBoolean,mlldNull

" Link to Mlld syntax groups
hi def link markdownMlldDirective mlldDirective
