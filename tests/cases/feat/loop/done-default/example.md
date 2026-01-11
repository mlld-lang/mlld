/var @result = loop(3) [
  when @input == null => continue "seed"
  done
]

/var @display = @result ?? "nil"
/show @display
