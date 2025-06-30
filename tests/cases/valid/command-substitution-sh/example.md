# Command Substitution in sh Blocks

This test verifies that command substitution works correctly in sh blocks across different scenarios.

## Basic Command Substitution

/exe @simple_subst() = sh {
  result=$(echo "basic substitution works")
  echo "Result: $result"
}
/var @test1 = @simple_subst()
/show @test1

## Command Substitution with Multiple Lines

/exe @multiline_subst() = sh {
  result=$(echo "line 1" && echo "line 2")
  echo "Combined: $result"
}
/var @test2 = @multiline_subst()
/show @test2

## Nested Command Substitution

/exe @nested_subst() = sh {
  inner=$(echo "inner")
  result=$(echo "outer contains: $inner")
  echo "$result"
}
/var @test3 = @nested_subst()
/show @test3

## Command Substitution with Exit Codes

/exe @exit_code_subst() = sh {
  result=$(echo "success" && exit 0)
  code=$?
  echo "Output: $result (exit code: $code)"
}
/var @test4 = @exit_code_subst()
/show @test4

## Command Substitution with stderr

/exe @stderr_subst() = sh {
  # This simulates a command that might write to stderr
  result=$(sh -c 'echo "stdout text" && echo "stderr text" >&2' 2>&1)
  echo "Captured: $result"
}
/var @test5 = @stderr_subst()
/show @test5

## Complex Pattern (similar to AI module)

/exe @complex_pattern() = sh {
  # Test if echo exists (it always does)
  if ! command -v echo >/dev/null 2>&1; then
    echo "Error: echo not found"
    exit 1
  fi
  
  # Capture output with error handling
  result=$(echo "complex pattern test" 2>&1)
  exit_code=$?
  
  if [ $exit_code -eq 0 ]; then
    echo "Success: $result"
  else
    echo "Failed: $result"
  fi
}
/var @test6 = @complex_pattern()
/show @test6

## Direct Output (for comparison)

/exe @direct_output() = sh {
  echo "direct output works"
}
/var @test7 = @direct_output()
/show @test7