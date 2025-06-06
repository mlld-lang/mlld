" Vim syntax file for Mlld
" Language: Mlld
" Maintainer: Auto-generated
" Latest Revision: 2025-06-05T21:09:22.542Z

if exists("b:current_syntax")
  finish
endif

" Include Markdown syntax as base
runtime! syntax/markdown.vim

" Define mlld-specific patterns
" Comments
syn match mlldComment "\(>>\|<<\).*$"

" Directives - must be at start of line
syn match mlldDirective "^@\(data\|text\|run\|add\|path\|import\|exec\|when\|output\)\>"

" Reserved variables
syn match mlldReservedVar "@\(INPUT\|TIME\|PROJECTPATH\|STDIN\|input\|time\|projectpath\|stdin\)\>"
syn match mlldReservedVar "@\."

" Regular variables (lower priority than directives and reserved)
syn match mlldVariable "@\w\+"

" Template blocks
syn region mlldTemplate start="\[\[" end="\]\]" contains=mlldTemplateVar
syn region mlldTemplateVar start="{{" end="}}" contained

" Command blocks
syn region mlldCommand start="\[(" end=")\]" contains=mlldVariable,mlldReservedVar

" Paths
syn region mlldPath start="\[" end="\]" contains=mlldURL,mlldVariable,mlldReservedVar

" URLs
syn match mlldURL "https\?://[^\]]*" contained

" Strings
syn region mlldString start='"' end='"'

" Keywords
syn keyword mlldKeyword from as foreach with to

" Numbers
syn match mlldNumber "\<\d\+\(\.\d\+\)\?\>"

" Booleans
syn keyword mlldBoolean true false

" Null
syn keyword mlldNull null

" Define highlighting
hi def link mlldComment Comment
hi def link mlldDirective Keyword
hi def link mlldReservedVar Constant
hi def link mlldVariable Identifier
hi def link mlldTemplate String
hi def link mlldTemplateVar Special
hi def link mlldCommand String
hi def link mlldPath String
hi def link mlldURL Underlined
hi def link mlldString String
hi def link mlldKeyword Operator
hi def link mlldNumber Number
hi def link mlldBoolean Boolean
hi def link mlldNull Constant

let b:current_syntax = "mlld"
