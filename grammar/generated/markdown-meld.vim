" Vim syntax additions for Meld in Markdown
" Place in after/syntax/markdown.vim

" Match Meld directives at start of line in Markdown
syn match markdownMeldDirective "^@\(text\|data\|run\|add\|path\|import\|exec\|define\|embed\|url\)\>" nextgroup=markdownMeldLine
syn region markdownMeldLine start="." end="$" contained contains=meldVariable,meldTemplate,meldPath,meldString,meldOperator,meldNumber,meldBoolean,meldNull

" Link to Meld syntax groups
hi def link markdownMeldDirective meldDirective
