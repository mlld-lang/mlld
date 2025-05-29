" Vim syntax file for Mlld
" Language: Mlld
" Maintainer: Auto-generated
" Latest Revision: 2025-05-30T01:20:32.855Z

if exists("b:current_syntax")
  finish
endif

" Keywords (directives)
syn keyword mlldDirective @data @text @run @add @path @import @exec

" Comments
syn match mlldComment ">>.*$"

" Variables
syn match mlldVariable "@\w\+"

" Template blocks
syn region mlldTemplate start="\[\[" end="\]\]" contains=mlldTemplateVar
syn match mlldTemplateVar "{{[^}]\+}}" contained

" Paths/URLs
syn region mlldPath start="\[" end="\]" contains=mlldURL
syn match mlldURL "https\?://[^\]]*" contained

" Strings
syn region mlldString start='"' end='"'

" Operators
syn match mlldOperator "\(=\|from\|as\)"

" Numbers
syn match mlldNumber "\<\d\+\(\.\d\+\)\?\>"

" Booleans
syn keyword mlldBoolean true false

" Null
syn keyword mlldNull null

" Define highlighting
hi def link mlldDirective Keyword
hi def link mlldComment Comment
hi def link mlldVariable Identifier
hi def link mlldTemplate String
hi def link mlldTemplateVar Special
hi def link mlldPath String
hi def link mlldURL Underlined
hi def link mlldString String
hi def link mlldOperator Operator
hi def link mlldNumber Number
hi def link mlldBoolean Boolean
hi def link mlldNull Constant

let b:current_syntax = "mlld"
