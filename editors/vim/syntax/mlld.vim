" Vim syntax file for Mlld
" Language: Mlld
" Maintainer: Auto-generated
" Latest Revision: 2025-06-04T04:23:08.345Z

if exists("b:current_syntax")
  finish
endif

" Keywords (directives)
syn keyword mlldDirective @data @text @run @add @path @import @exec @when @output

" Language keywords
syn keyword mlldLanguage javascript js python py bash sh

" Comments
syn match mlldComment ">>.*$"

" Reserved variables
syn match mlldReservedVar "@\(INPUT\|TIME\|PROJECTPATH\)\>"

" Variables
syn match mlldVariable "@\w\+"

" Field access
syn match mlldFieldAccess "\.\(\w\+\|\d\+\)"

" Template blocks
syn region mlldTemplate start="\[\[" end="\]\]" contains=mlldTemplateVar
syn match mlldTemplateVar "{{[^}]\+}}" contained

" Command brackets - must come before path brackets
syn region mlldCommand start="\[(" end=")\]" contains=mlldVariable

" Paths/URLs
syn region mlldPath start="\[" end="\]" contains=mlldURL
syn match mlldURL "https\?://[^\]]*" contained

" Strings
syn region mlldString start='"' end='"'

" Operators
syn match mlldOperator "\(=\|from\|as\|foreach\|with\|to\)"

" Numbers
syn match mlldNumber "\<\d\+\(\.\d\+\)\?\>"

" Booleans
syn keyword mlldBoolean true false

" Null
syn keyword mlldNull null

" Define highlighting
hi def link mlldDirective Keyword
hi def link mlldLanguage Type
hi def link mlldComment Comment
hi def link mlldReservedVar Constant
hi def link mlldVariable Identifier
hi def link mlldFieldAccess Special
hi def link mlldTemplate String
hi def link mlldTemplateVar Special
hi def link mlldCommand String
hi def link mlldPath String
hi def link mlldURL Underlined
hi def link mlldString String
hi def link mlldOperator Operator
hi def link mlldNumber Number
hi def link mlldBoolean Boolean
hi def link mlldNull Constant

let b:current_syntax = "mlld"
