" Vim syntax file for Mlld
" Language: Mlld
" Maintainer: Auto-generated
" Latest Revision: 2026-04-20T09:10:21.196Z

if exists("b:current_syntax")
  finish
endif

" Include Markdown syntax as base
runtime! syntax/markdown.vim

" Syntax synchronization
syn sync minlines=10

" Define mlld-specific patterns
" Comments
syn match mlldComment "\(>>\|<<\).*$"

" Directives - must be at start of line
syn match mlldDirective "^/\(var\|record\|shelf\|show\|stream\|run\|exe\|import\|when\|if\|output\|append\|file\|files\|for\|loop\|log\|bail\|checkpoint\|guard\|hook\|export\|policy\|auth\|sign\|verify\|box\|while\|store\|needs\|profiles\)\>"

" Directive-like keywords in strict expression/block forms
syn match mlldInlineDirective "\<\(loop\|while\)\>\ze\s*("
syn match mlldInlineDirective "\<if\>\ze\s*[@\[(]"
syn match mlldInlineDirective "\<box\>\ze\s*\(with\>\|\[\|@\)"
syn match mlldInlineDirective "\<\(file\|files\)\>\ze\s*\(<\|"\|@\)"
syn match mlldInlineDirective "\<\(needs\|profiles\)\>\ze\s*{"
syn match mlldInlineDirective "\<auth\>\ze\s\+@"

" Operators (high priority)
" Logical operators
syn match mlldLogicalOp "&&\|||\|!"
" Comparison operators
syn match mlldComparisonOp "==\|!=\|<=\|>=\|<\|>"
" Ternary operators
syn match mlldTernaryOp "[?:]"
" Arrow operators
syn match mlldArrowOp "=->\|=>\|->"
" Pipe operator
syn match mlldPipeOp "|"
" Assignment operator
syn match mlldAssignOp "="

" When expressions
syn match mlldWhenKeyword "when\s*:" contains=mlldWhenColon
syn match mlldWhenColon ":" contained

" Flow-control keywords
syn keyword mlldControlKeyword until endless else let done continue skip bail

" Reserved variables
syn match mlldReservedVar "@\(INPUT\|TIME\|PROJECTPATH\|STDIN\|input\|time\|projectpath\|stdin\|now\|NOW\|base\)\>"
syn match mlldReservedVar "@\."

" Regular variables (lower priority than directives and reserved)
syn match mlldVariable "@[A-Za-z_][A-Za-z0-9_-]*"
syn match mlldObjectKey "\<[A-Za-z_][A-Za-z0-9_-]*\>\ze\s*:"

" Triple-colon template blocks (with {{var}} interpolation)
syn region mlldTripleTemplate start=":::" end=":::" contains=mlldTemplateVar,mlldXmlTag
syn match mlldTemplateVar "{{[^}]*}}" contained
syn match mlldXmlTag "<[^>]*>" contained

" Template blocks (double-colon syntax with @var interpolation)
syn region mlldTemplate start="::" end="::" contains=mlldVariable,mlldReservedVar,mlldAlligator

" Backtick templates (with @var interpolation)
syn region mlldBacktickTemplate start="`" end="`" contains=mlldVariable,mlldReservedVar,mlldAlligator

" Double quotes with interpolation
syn region mlldStringInterpolated start='"' end='"' contains=mlldVariable,mlldReservedVar,mlldAlligator

" Single quotes - no interpolation
syn region mlldStringLiteral start="'" end="'"

" Alligator syntax (file loading) - must contain . / * or @
syn match mlldAlligator "<[^>]*[./*@][^>]*>"
" Alligator with section
syn match mlldAlligatorSection "<\([^>#]\+\)\(\s*#\s*\)\([^>]\+\)>" contains=mlldSectionMarker
syn match mlldSectionMarker "#" contained

" Language-specific code blocks (NO mlld interpolation)
" JavaScript/Node blocks
syn region mlldJSBlock start="\<\(js\|javascript\|node\)\s*{" matchgroup=mlldCodeDelimiter end="}" contains=@javascript fold keepend
" Python blocks
syn region mlldPythonBlock start="\<\(python\|py\)\s*{" matchgroup=mlldCodeDelimiter end="}" contains=@python fold keepend
" Shell/Bash blocks
syn region mlldShellBlock start="\<\(bash\|sh\)\s*{" matchgroup=mlldCodeDelimiter end="}" contains=@shell fold keepend

" Generic command blocks (braces) WITH interpolation - must come after language blocks
syn region mlldCommand start="{" end="}" contains=mlldVariable,mlldReservedVar,mlldAlligator,mlldLanguageKeyword

" Language keywords
syn match mlldLanguageKeyword "\<\(js\|javascript\|node\|python\|py\|bash\|sh\)\>"

" Paths
syn region mlldPath start="\[" end="\]" contains=mlldURL,mlldVariable,mlldReservedVar

" URLs
syn match mlldURL "https\?://[^\]>]*" contained

" Keywords
syn keyword mlldKeyword from as record foreach with to tools mcp git using

" Numbers
syn match mlldNumber "\<\d\+\(\.\d\+\)\?\>"

" Booleans
syn keyword mlldBoolean true false

" Null
syn keyword mlldNull null

" Define highlighting
hi def link mlldComment Comment
hi def link mlldDirective Keyword
hi def link mlldInlineDirective Keyword
hi def link mlldLogicalOp Operator
hi def link mlldComparisonOp Operator
hi def link mlldTernaryOp Operator
hi def link mlldArrowOp Operator
hi def link mlldPipeOp Operator
hi def link mlldAssignOp Operator
hi def link mlldWhenKeyword Keyword
hi def link mlldWhenColon Keyword
hi def link mlldControlKeyword Keyword
hi def link mlldReservedVar Constant
hi def link mlldVariable Identifier
hi def link mlldObjectKey Identifier
hi def link mlldTripleTemplate String
hi def link mlldTemplate String
hi def link mlldTemplateVar Special
hi def link mlldXmlTag Tag
hi def link mlldBacktickTemplate String
hi def link mlldStringInterpolated String
hi def link mlldStringLiteral String
hi def link mlldAlligator Special
hi def link mlldAlligatorSection Special
hi def link mlldSectionMarker Delimiter
hi def link mlldCommand String
hi def link mlldCodeDelimiter Delimiter
hi def link mlldJSBlock Special
hi def link mlldPythonBlock Special
hi def link mlldShellBlock Special
hi def link mlldLanguageKeyword Type
hi def link mlldPath String
hi def link mlldURL Underlined
hi def link mlldKeyword Operator
hi def link mlldNumber Number
hi def link mlldBoolean Boolean
hi def link mlldNull Constant

let b:current_syntax = "mlld"
