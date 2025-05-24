" Vim indent file
" Language: Meld

if exists("b:did_indent")
  finish
endif
let b:did_indent = 1

setlocal indentexpr=GetMeldIndent()
setlocal indentkeys=0{,0},0],!^F,o,O,e

if exists("*GetMeldIndent")
  finish
endif

function! GetMeldIndent()
  let lnum = prevnonblank(v:lnum - 1)
  
  if lnum == 0
    return 0
  endif
  
  let line = getline(lnum)
  let ind = indent(lnum)
  
  " Increase indent after opening braces/brackets
  if line =~ '[{[\[]]\s*$'
    let ind += shiftwidth()
  endif
  
  " Decrease indent for closing braces/brackets
  if getline(v:lnum) =~ '^\s*[}\]]]'
    let ind -= shiftwidth()
  endif
  
  " Handle multiline templates
  if line =~ '\[\[\s*$'
    let ind += shiftwidth()
  endif
  
  if getline(v:lnum) =~ '^\s*\]\]'
    let ind -= shiftwidth()
  endif
  
  " Handle code blocks
  if line =~ '```\w*\s*$'
    let ind += shiftwidth()
  endif
  
  if getline(v:lnum) =~ '^\s*```\s*$'
    let ind -= shiftwidth()
  endif
  
  return ind
endfunction