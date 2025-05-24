" Vim filetype detection file
" Language: mlld

" Always detect .mlld and .mld files as mlld
autocmd BufNewFile,BufRead *.mlld set filetype=mlld
autocmd BufNewFile,BufRead *.mld set filetype=mlld

" For .md files, check if they contain mlld directives
autocmd BufNewFile,BufRead *.md call s:DetectMLLD()

function! s:DetectMLLD()
  " Check first 100 lines for mlld directives
  let n = 1
  let max_lines = min([100, line('$')])
  
  while n <= max_lines
    let line = getline(n)
    
    " Check for mlld directives - the only lines that activate mlld
    if line =~ '^@\(text\|data\|path\|run\|exec\|add\|import\)\s'
      set filetype=mlld
      return
    endif
    
    let n = n + 1
  endwhile
  
  " Not a mlld file, leave as markdown
endfunction