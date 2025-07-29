" Vim syntax file for Mlld
" Language: Mlld
" Maintainer: Auto-generated
" Latest Revision: 2025-07-29T05:57:27.525Z

if exists("b:current_syntax")
  finish
endif

" Include Markdown syntax as base
runtime! syntax/markdown.vim

" Define mlld-specific patterns
" Comments
syn match mlldComment "\(>>\|<<\).*$"

" Directives - must be at start of line
syn match mlldDirective "^/\(var\|show\|run\|exe\|path\|import\|when\|output\)\>"

" Operators (high priority)
" Logical operators
syn match mlldLogicalOp "&&\|||\|!"
" Comparison operators
syn match mlldComparisonOp "==\|!=\|<=\|>=\|<\|>"
" Ternary operators
syn match mlldTernaryOp "[?:]"
" Arrow operator
syn match mlldArrowOp "=>"
" Pipe operator
syn match mlldPipeOp "|"
" Assignment operator
syn match mlldAssignOp "="

" When expressions
syn match mlldWhenKeyword "when\s*:" contains=mlldWhenColon
syn match mlldWhenColon ":" contained

" Reserved variables
syn match mlldReservedVar "@\(INPUT\|TIME\|PROJECTPATH\|STDIN\|input\|time\|projectpath\|stdin\|now\|NOW\|base\)\>"
syn match mlldReservedVar "@\."

" Regular variables (lower priority than directives and reserved)
syn match mlldVariable "@\w\+"

" Triple-colon template blocks
syn region mlldTripleTemplate start=":::" end=":::" contains=mlldTemplateVar

" Template blocks (double-colon syntax)
syn region mlldTemplate start="::" end="::" contains=mlldTemplateVar
syn region mlldTemplateVar start="{{" end="}}" contained

" Backtick templates
syn region mlldBacktickTemplate start="`" end="`" contains=mlldVariable,mlldReservedVar

" Alligator syntax (file loading)
syn region mlldAlligator start="<" end=">" contains=mlldPath,mlldURL,mlldVariable,mlldReservedVar

" Language-specific code blocks (must come before generic command blocks)
" JavaScript/Node blocks
syn region mlldJSBlock start="\<\(js\|javascript\|node\)\s*{" end="}" contains=@javascript keepend
" Python blocks
syn region mlldPythonBlock start="\<\(python\|py\)\s*{" end="}" contains=@python keepend
" Shell/Bash blocks
syn region mlldShellBlock start="\<\(bash\|sh\)\s*{" end="}" contains=@shell keepend

" Generic command blocks (braces) - fallback for unmatched languages
syn region mlldCommand start="{" end="}" contains=mlldVariable,mlldReservedVar,mlldLanguageKeyword

" Language keywords
syn match mlldLanguageKeyword "\<\(js\|javascript\|node\|python\|py\|bash\|sh\)\>"

" Paths
syn region mlldPath start="\[" end="\]" contains=mlldURL,mlldVariable,mlldReservedVar

" URLs
syn match mlldURL "https\?://[^\]>]*" contained

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
hi def link mlldLogicalOp Operator
hi def link mlldComparisonOp Operator
hi def link mlldTernaryOp Operator
hi def link mlldArrowOp Operator
hi def link mlldPipeOp Operator
hi def link mlldAssignOp Operator
hi def link mlldWhenKeyword Keyword
hi def link mlldWhenColon Keyword
hi def link mlldReservedVar Constant
hi def link mlldVariable Identifier
hi def link mlldTripleTemplate String
hi def link mlldTemplate String
hi def link mlldTemplateVar Special
hi def link mlldBacktickTemplate String
hi def link mlldAlligator String
hi def link mlldCommand String
hi def link mlldJSBlock Special
hi def link mlldPythonBlock Special
hi def link mlldShellBlock Special
hi def link mlldLanguageKeyword Type
hi def link mlldPath String
hi def link mlldURL Underlined
hi def link mlldString String
hi def link mlldKeyword Operator
hi def link mlldNumber Number
hi def link mlldBoolean Boolean
hi def link mlldNull Constant

let b:current_syntax = "mlld"
