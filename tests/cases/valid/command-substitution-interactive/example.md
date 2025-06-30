# Command Substitution with Interactive-like Commands

This test simulates the behavior we see with interactive CLI tools in command substitution.

## Test Direct Execution

/exe @test_direct() = sh {
  # Direct execution - simulate inline
  if [ -t 0 ] || [ -t 1 ]; then
    echo "Direct execution"
  else
    echo "Direct execution" >&2
  fi
}
/var @direct = @test_direct()
/show `Direct: [@direct]`

## Test Command Substitution

/exe @test_substitution() = sh {
  # This might capture differently
  result=$(
    if [ -t 0 ] || [ -t 1 ]; then
      echo "Via substitution"
    else
      echo "Via substitution" >&2
    fi
  )
  echo "Captured: $result"
}
/var @subst = @test_substitution()
/show `Substitution: [@subst]`

## Test with Stderr Capture

/exe @test_with_stderr() = sh {
  # Explicitly capture both stdout and stderr
  result=$(
    if [ -t 0 ] || [ -t 1 ]; then
      echo "With stderr"
    else
      echo "With stderr" >&2
    fi
    2>&1
  )
  echo "Both streams: $result"
}
/var @both = @test_with_stderr()
/show `With stderr: [@both]`

## Python Script Simulation

/exe @python_sim() = sh {
  # Simulate a Python script that might buffer differently
  python3 -c "import sys; sys.stdout.write('Python output'); sys.stdout.flush()" 2>/dev/null || echo "Python not available"
}
/var @py_direct = @python_sim()
/show `Python direct: [@py_direct]`

/exe @python_subst() = sh {
  result=$(python3 -c "import sys; sys.stdout.write('Python output'); sys.stdout.flush()" 2>/dev/null || echo "Python not available")
  echo "$result"
}
/var @py_subst = @python_subst()
/show `Python subst: [@py_subst]`