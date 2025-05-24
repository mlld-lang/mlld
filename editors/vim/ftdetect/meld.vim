" Vim filetype detection file
" Language: Meld

" Always detect .mld and .meld files as Meld
autocmd BufNewFile,BufRead *.mld set filetype=meld
autocmd BufNewFile,BufRead *.meld set filetype=meld

" For .md files, check if they contain Meld directives
autocmd BufNewFile,BufRead *.md call s:DetectMeld()

function! s:DetectMeld()
  " Check first 50 lines for Meld patterns
  let n = 1
  let max_lines = min([50, line('$')])
  
  while n <= max_lines
    let line = getline(n)
    
    " Check for Meld directives
    if line =~ '^@\(text\|data\|path\|run\|exec\|add\|import\)\s'
      set filetype=meld
      return
    endif
    
    " Check for Meld comments
    if line =~ '^>>'
      set filetype=meld
      return
    endif
    
    let n = n + 1
  endwhile
  
  " Not a Meld file, leave as markdown
endfunction