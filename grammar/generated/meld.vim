" Vim syntax file for Meld
" Language: Meld
" Maintainer: Auto-generated
" Latest Revision: 2025-05-24T19:55:11.636Z

if exists("b:current_syntax")
  finish
endif

" Keywords (directives)
syn keyword meldDirective @text @data @run @add @path @import @exec @define @embed @url

" Comments
syn match meldComment ">>.*$"

" Variables
syn match meldVariable "@\w\+"

" Template blocks
syn region meldTemplate start="\[\[" end="\]\]" contains=meldTemplateVar
syn match meldTemplateVar "{{[^}]\+}}" contained

" Paths/URLs
syn region meldPath start="\[" end="\]" contains=meldURL
syn match meldURL "https\?://[^\]]*" contained

" Strings
syn region meldString start='"' end='"'

" Operators
syn match meldOperator "\(=\|from\|as\)"

" Numbers
syn match meldNumber "\<\d\+\(\.\d\+\)\?\>"

" Booleans
syn keyword meldBoolean true false

" Null
syn keyword meldNull null

" Define highlighting
hi def link meldDirective Keyword
hi def link meldComment Comment
hi def link meldVariable Identifier
hi def link meldTemplate String
hi def link meldTemplateVar Special
hi def link meldPath String
hi def link meldURL Underlined
hi def link meldString String
hi def link meldOperator Operator
hi def link meldNumber Number
hi def link meldBoolean Boolean
hi def link meldNull Constant

let b:current_syntax = "meld"
