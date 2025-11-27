" Override polyglot's interference with mlld syntax
" This file loads AFTER other syntax files

" Don't reload if already done
if exists("b:mlld_after_loaded")
  finish
endif
let b:mlld_after_loaded = 1

" Define mlld-run code block region first (highest priority)
syn region mlldRunCodeBlock start="^\s*```mlld-run\s*$" end="^\s*```\s*$" contains=mlldRunContent
syn region mlldRunContent start="." end="\ze^\s*```\s*$" contained contains=mlldComment,mlldDirective,mlldReserved,mlldVariable,mlldStringInterpolated,mlldStringLiteral,mlldTemplate,mlldTripleTemplate,mlldTemplateVar,mlldCommand,mlldLogicalOp,mlldComparisonOp,mlldTernaryOp,mlldArrowOp,mlldWhenKeyword,mlldAlligator,mlldBacktickTemplate

" Define our syntax patterns directly
syn match mlldComment "\(>>\|<<\).*$"
syn match mlldDirective "^/\(var\|show\|stream\|run\|exe\|path\|import\|when\|output\|append\|for\|log\|guard\|export\)\>"
syn match mlldLogicalOp "&&\|||\|!"
syn match mlldComparisonOp "==\|!=\|<=\|>=\|<\|>"
syn match mlldTernaryOp "[?:]"
syn match mlldArrowOp "=>"
syn match mlldWhenKeyword "when\s*:"
syn match mlldReserved "@\(INPUT\|TIME\|PROJECTPATH\|STDIN\|input\|time\|projectpath\|stdin\|now\|NOW\|base\)\>"
syn match mlldReserved "@\."
syn match mlldVariable "@\w\+"
syn region mlldStringInterpolated start='"' end='"' contains=mlldVariable,mlldReserved,mlldAlligator
syn region mlldStringLiteral start="'" end="'"
syn region mlldTripleTemplate start=":::" end=":::" contains=mlldTemplateVar
syn region mlldTemplate start="::" end="::" contains=mlldVariable,mlldReserved,mlldAlligator
syn match mlldTemplateVar "{{[^}]*}}" contained
syn region mlldBacktickTemplate start="`" end="`" contains=mlldVariable,mlldReserved,mlldAlligator
syn match mlldAlligator "<[^>]*[./*@][^>]*>"

" Language-specific blocks
syn region mlldJSBlock start="\<\(js\|javascript\|node\)\s*{" end="}" contains=@javascript fold keepend
syn region mlldPythonBlock start="\<\(python\|py\)\s*{" end="}" contains=@python fold keepend
syn region mlldShellBlock start="\<\(bash\|sh\)\s*{" end="}" contains=@shell fold keepend

" Syntax synchronization to help reset after language blocks
syn sync minlines=10

" Generic command
syn region mlldCommand start="{" end="}" contains=mlldVariable,mlldReserved,mlldAlligator,mlldLanguageKeyword
syn match mlldLanguageKeyword "\<\(js\|sh\|node\|python\)\>"

" Force our colors
hi mlldComment ctermfg=242 guifg=#6c6c6c
hi mlldDirective ctermfg=214 cterm=bold guifg=#ffaf00 gui=bold
hi mlldLogicalOp ctermfg=206 guifg=#ff5faf
hi mlldComparisonOp ctermfg=206 guifg=#ff5faf
hi mlldTernaryOp ctermfg=206 guifg=#ff5faf
hi mlldArrowOp ctermfg=214 guifg=#ffaf00
hi mlldWhenKeyword ctermfg=214 cterm=bold guifg=#ffaf00 gui=bold
hi mlldReserved ctermfg=170 guifg=#d75fd7
hi mlldVariable ctermfg=117 guifg=#87d7ff
hi mlldStringInterpolated ctermfg=150 guifg=#afd787
hi mlldStringLiteral ctermfg=150 guifg=#afd787
hi mlldTripleTemplate ctermfg=150 guifg=#afd787
hi mlldTemplate ctermfg=150 guifg=#afd787
hi mlldTemplateVar ctermfg=214 guifg=#ffaf00
hi mlldBacktickTemplate ctermfg=150 guifg=#afd787
hi mlldAlligator ctermfg=229 guifg=#ffffaf
hi mlldCommand ctermfg=150 guifg=#afd787
hi mlldJSBlock ctermfg=214 guifg=#ffaf00
hi mlldPythonBlock ctermfg=214 guifg=#ffaf00
hi mlldShellBlock ctermfg=214 guifg=#ffaf00
hi mlldLanguageKeyword ctermfg=204 guifg=#ff5f87
hi mlldRunCodeBlock ctermfg=242 guifg=#6c6c6c
hi mlldRunContent ctermfg=255 guifg=#ffffff