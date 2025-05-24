" Vim syntax file
" Language: Meld
" Maintainer: Meld Team
" Latest Revision: 2024

if exists("b:current_syntax")
  finish
endif

" Comments
syn match meldComment "^>>.*$" contains=meldTodo
syn keyword meldTodo TODO FIXME XXX NOTE contained

" Directives - Keywords
syn match meldDirective "@text\>" nextgroup=meldVariable skipwhite
syn match meldDirective "@data\>" nextgroup=meldVariable skipwhite
syn match meldDirective "@path\>" nextgroup=meldVariable skipwhite
syn match meldDirective "@run\>" nextgroup=meldVariable skipwhite
syn match meldDirective "@exec\>" nextgroup=meldVariable skipwhite
syn match meldDirective "@add\>" nextgroup=meldAddArgs skipwhite
syn match meldDirective "@import\>" nextgroup=meldImportArgs skipwhite

" Variables
syn match meldVariable "\<\w\+\>" contained nextgroup=meldAssignment skipwhite
syn match meldVariableRef "@\w\+"

" Assignment operator
syn match meldAssignment "=" contained nextgroup=meldValue skipwhite

" Values
syn region meldString start=+"+ end=+"+ contains=meldEscape,meldInterpolation contained
syn region meldString start=+'+ end=+'+ contains=meldEscape contained
syn match meldEscape "\\." contained

" Values can include paths with sections and section rename
syn match meldValue "\[.\{-}\]" contains=meldPath nextgroup=meldSectionRename skipwhite contained

" Template blocks
syn region meldTemplate start="\[\[" end="\]\]" contains=meldInterpolation,@Spell
syn region meldInterpolation start="{{" end="}}" contains=meldInterpolationVar contained
syn match meldInterpolationVar "\w\+" contained

" Path references
syn region meldPath start="\[" end="\]" contains=meldSpecialVar,meldSectionRef
syn match meldSpecialVar "@PROJECTPATH\|@CWD" contained

" Section references with optional rename
syn match meldSectionRef "\([^]#]\+\)\(#\s*\)\([^]]\+\)" contained contains=meldSectionPath,meldSectionSep,meldSectionName
syn match meldSectionPath "[^]#]\+" contained
syn match meldSectionSep "#" contained
syn match meldSectionName "[^]]\+" contained

" Section rename with 'as'
syn match meldSectionRename "\s\+as\s\+\"[^\"]\+\"" contains=meldAsKeyword,meldSectionNewName
syn keyword meldAsKeyword as contained
syn match meldSectionNewName "\"[^\"]\+\"" contained

" JSON-like data structures
syn region meldObject start="{" end="}" contains=meldObjectKey,meldString,meldNumber,meldBoolean,meldNull,meldObject,meldArray contained fold
syn region meldArray start="\[" end="\]" contains=meldString,meldNumber,meldBoolean,meldNull,meldObject,meldArray contained fold
syn match meldObjectKey '"\w\+"\_s*:' contains=meldString contained
syn match meldNumber "-\?\d\+\(\.\d\+\)\?\([eE][+-]\?\d\+\)\?" contained
syn keyword meldBoolean true false contained
syn keyword meldNull null contained

" Code blocks
syn region meldCodeBlock start="```\z(\w*\)" end="```" contains=@meldCode keepend
syn cluster meldCode contains=meldCodeLang
syn match meldCodeLang "```\zs\w*" contained

" Import specific
syn match meldImportArgs "\*\|{\w\+\(,\s*\w\+\)*}" contained nextgroup=meldFrom skipwhite
syn keyword meldFrom from contained nextgroup=meldPath skipwhite

" Add specific
syn region meldAddSection start='"' end='"' contained nextgroup=meldFrom skipwhite
syn match meldAddTemplate "template\s\+\w\+\s*(" contained
syn match meldAddTemplateCall "\w\+\s*(" contained

" Special assignment patterns
syn match meldFieldAccess "\w\+\.\w\+" contained

" Link to default highlight groups
hi def link meldComment        Comment
hi def link meldTodo           Todo
hi def link meldDirective      Keyword
hi def link meldVariable       Identifier
hi def link meldVariableRef    Identifier
hi def link meldAssignment     Operator
hi def link meldString         String
hi def link meldEscape         SpecialChar
hi def link meldTemplate       String
hi def link meldInterpolation  Special
hi def link meldInterpolationVar Identifier
hi def link meldPath           String
hi def link meldSpecialVar     Constant
hi def link meldSectionPath    String
hi def link meldSectionSep     Delimiter
hi def link meldSectionName    Title
hi def link meldAsKeyword      Keyword
hi def link meldSectionNewName String
hi def link meldObject         Structure
hi def link meldArray          Structure
hi def link meldObjectKey      Type
hi def link meldNumber         Number
hi def link meldBoolean        Boolean
hi def link meldNull           Constant
hi def link meldCodeBlock      String
hi def link meldCodeLang       Type
hi def link meldFrom           Keyword
hi def link meldImportArgs     Identifier
hi def link meldAddSection     String
hi def link meldAddTemplate    Function
hi def link meldAddTemplateCall Function
hi def link meldFieldAccess    Type

" Embedded markdown
syn include @markdown syntax/markdown.vim
syn region meldMarkdown start="\%^" end="@\|>>\|$" contains=@markdown,meldDirective,meldComment

let b:current_syntax = "meld"