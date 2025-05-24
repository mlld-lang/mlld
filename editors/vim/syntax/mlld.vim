" Vim syntax file
" Language: MLLD
" Maintainer: MLLD Team
" Latest Revision: 2024

if exists("b:current_syntax")
  finish
endif

" Comments
syn match mlldComment "^>>.*$" contains=mlldTodo
syn keyword mlldTodo TODO FIXME XXX NOTE contained

" Directives - Keywords
syn match mlldDirective "@text\>" nextgroup=mlldVariable skipwhite
syn match mlldDirective "@data\>" nextgroup=mlldVariable skipwhite
syn match mlldDirective "@path\>" nextgroup=mlldVariable skipwhite
syn match mlldDirective "@run\>" nextgroup=mlldVariable skipwhite
syn match mlldDirective "@exec\>" nextgroup=mlldVariable skipwhite
syn match mlldDirective "@add\>" nextgroup=mlldAddArgs skipwhite
syn match mlldDirective "@import\>" nextgroup=mlldImportArgs skipwhite

" Variables
syn match mlldVariable "\<\w\+\>" contained nextgroup=mlldAssignment skipwhite
syn match mlldVariableRef "@\w\+"

" Assignment operator
syn match mlldAssignment "=" contained nextgroup=mlldValue skipwhite

" Values
syn region mlldString start=+"+ end=+"+ contains=mlldEscape,mlldInterpolation contained
syn region mlldString start=+'+ end=+'+ contains=mlldEscape contained
syn match mlldEscape "\\." contained

" Values can include paths with sections and section rename
syn match mlldValue "\[.\{-}\]" contains=mlldPath nextgroup=mlldSectionRename skipwhite contained

" Template blocks
syn region mlldTemplate start="\[\[" end="\]\]" contains=mlldInterpolation,@Spell
syn region mlldInterpolation start="{{" end="}}" contains=mlldInterpolationVar contained
syn match mlldInterpolationVar "\w\+" contained

" Path references
syn region mlldPath start="\[" end="\]" contains=mlldSpecialVar,mlldSectionRef
syn match mlldSpecialVar "@PROJECTPATH\|@CWD" contained

" Section references with optional rename
syn match mlldSectionRef "\([^]#]\+\)\(#\s*\)\([^]]\+\)" contained contains=mlldSectionPath,mlldSectionSep,mlldSectionName
syn match mlldSectionPath "[^]#]\+" contained
syn match mlldSectionSep "#" contained
syn match mlldSectionName "[^]]\+" contained

" Section rename with 'as'
syn match mlldSectionRename "\s\+as\s\+\"[^\"]\+\"" contains=mlldAsKeyword,mlldSectionNewName
syn keyword mlldAsKeyword as contained
syn match mlldSectionNewName "\"[^\"]\+\"" contained

" JSON-like data structures
syn region mlldObject start="{" end="}" contains=mlldObjectKey,mlldString,mlldNumber,mlldBoolean,mlldNull,mlldObject,mlldArray contained fold
syn region mlldArray start="\[" end="\]" contains=mlldString,mlldNumber,mlldBoolean,mlldNull,mlldObject,mlldArray contained fold
syn match mlldObjectKey '"\w\+"\_s*:' contains=mlldString contained
syn match mlldNumber "-\?\d\+\(\.\d\+\)\?\([eE][+-]\?\d\+\)\?" contained
syn keyword mlldBoolean true false contained
syn keyword mlldNull null contained

" Code blocks
syn region mlldCodeBlock start="```\z(\w*\)" end="```" contains=@mlldCode keepend
syn cluster mlldCode contains=mlldCodeLang
syn match mlldCodeLang "```\zs\w*" contained

" Import specific
syn match mlldImportArgs "\*\|{\w\+\(,\s*\w\+\)*}" contained nextgroup=mlldFrom skipwhite
syn keyword mlldFrom from contained nextgroup=mlldPath skipwhite

" Add specific
syn region mlldAddSection start='"' end='"' contained nextgroup=mlldFrom skipwhite
syn match mlldAddTemplate "template\s\+\w\+\s*(" contained
syn match mlldAddTemplateCall "\w\+\s*(" contained

" Special assignment patterns
syn match mlldFieldAccess "\w\+\.\w\+" contained

" Link to default highlight groups
hi def link mlldComment        Comment
hi def link mlldTodo           Todo
hi def link mlldDirective      Keyword
hi def link mlldVariable       Identifier
hi def link mlldVariableRef    Identifier
hi def link mlldAssignment     Operator
hi def link mlldString         String
hi def link mlldEscape         SpecialChar
hi def link mlldTemplate       String
hi def link mlldInterpolation  Special
hi def link mlldInterpolationVar Identifier
hi def link mlldPath           String
hi def link mlldSpecialVar     Constant
hi def link mlldSectionPath    String
hi def link mlldSectionSep     Delimiter
hi def link mlldSectionName    Title
hi def link mlldAsKeyword      Keyword
hi def link mlldSectionNewName String
hi def link mlldObject         Structure
hi def link mlldArray          Structure
hi def link mlldObjectKey      Type
hi def link mlldNumber         Number
hi def link mlldBoolean        Boolean
hi def link mlldNull           Constant
hi def link mlldCodeBlock      String
hi def link mlldCodeLang       Type
hi def link mlldFrom           Keyword
hi def link mlldImportArgs     Identifier
hi def link mlldAddSection     String
hi def link mlldAddTemplate    Function
hi def link mlldAddTemplateCall Function
hi def link mlldFieldAccess    Type

" Embedded markdown
syn include @markdown syntax/markdown.vim
syn region mlldMarkdown start="\%^" end="@\|>>\|$" contains=@markdown,mlldDirective,mlldComment

let b:current_syntax = "mlld"