/var @outer = true
/var @inner = true
/when @outer [
  show "outer block"
  when @inner => show "inner when"
]
