# Command Substitution with TTY-aware Commands

This test explores how command substitution affects commands that behave differently based on TTY detection.

## Test TTY Detection

/exe @check_tty() = sh {
  # Direct execution (might have TTY)
  if [ -t 1 ]; then
    echo "Direct: stdout is a TTY"
  else
    echo "Direct: stdout is NOT a TTY"
  fi
}
/var @tty1 = @check_tty()
/show @tty1

/exe @check_tty_subst() = sh {
  # Inside command substitution (no TTY)
  result=$(
    if [ -t 1 ]; then
      echo "Subst: stdout is a TTY"
    else
      echo "Subst: stdout is NOT a TTY"
    fi
  )
  echo "$result"
}
/var @tty2 = @check_tty_subst()
/show @tty2

## Test with Script Command (TTY-aware)

/exe @script_direct() = sh {
  # Some commands behave differently without TTY
  # Using 'cat' as a simple example that works everywhere
  echo "test input" | cat
}
/var @script1 = @script_direct()
/show @script1

/exe @script_subst() = sh {
  # Same command in substitution
  result=$(echo "test input" | cat)
  echo "Captured: $result"
}
/var @script2 = @script_subst()
/show @script2

## Test Process Substitution vs Command Substitution

/exe @proc_subst_test() = sh {
  # Note: Process substitution <(...) might not be available in all shells
  # Just using regular piping instead
  echo "data" | { read line; echo "Read: $line"; }
}
/var @proc1 = @proc_subst_test()
/show @proc1

## Test Buffering Behavior

/exe @buffer_test() = sh {
  # Test if buffering affects output capture
  result=$(printf "unbuffered" && printf " output")
  echo "Result: $result"
}
/var @buffer1 = @buffer_test()
/show @buffer1