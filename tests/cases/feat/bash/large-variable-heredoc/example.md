# Test Large Variable Handling with Heredoc

This test verifies that large variables work with bash executables.

## Pass a simple test to bash
/exe @process(data) = sh {
  echo "Received: $data"
}

## Execute 
/show @process("test data")