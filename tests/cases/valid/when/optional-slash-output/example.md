/var @condition = "true"
/var @message = "Output with slash"

# Test /when with /output (optional slash)
/when @condition => /output @message to "test-output.txt"