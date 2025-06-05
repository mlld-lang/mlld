" Override polyglot's interference with mlld syntax
" This file loads AFTER other syntax files

" Don't reload if already done
if exists("b:mlld_after_loaded")
  finish
endif
let b:mlld_after_loaded = 1

" Define our syntax patterns directly
syn match mlldComment "\(>>\|<<\).*$"
syn match mlldDirective "^@\(data\|text\|run\|add\|path\|import\|exec\|when\|output\)\>"
syn match mlldReserved "@\(INPUT\|TIME\|PROJECTPATH\|STDIN\|input\|time\|projectpath\|stdin\)\>"
syn match mlldReserved "@\."
syn match mlldVariable "@\w\+"
syn region mlldString start='"' end='"'
syn region mlldTemplate start="\[\[" end="\]\]" contains=mlldTemplateVar
syn match mlldTemplateVar "{{[^}]*}}" contained
syn region mlldCommand start="\[(" end=")\]"

" Force our colors
hi mlldComment ctermfg=242 guifg=#6c6c6c
hi mlldDirective ctermfg=214 cterm=bold guifg=#ffaf00 gui=bold
hi mlldReserved ctermfg=170 guifg=#d75fd7
hi mlldVariable ctermfg=117 guifg=#87d7ff
hi mlldString ctermfg=150 guifg=#afd787
hi mlldTemplate ctermfg=150 guifg=#afd787
hi mlldTemplateVar ctermfg=214 guifg=#ffaf00
hi mlldCommand ctermfg=150 guifg=#afd787