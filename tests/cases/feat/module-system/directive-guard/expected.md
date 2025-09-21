# Test directive execution guard during imports

# Verify variables and executables are available (guard allows these)
Message: Hello from module
Hello, World!
# The key test: if directive guard failed, we would see:
# - "Module side effect!" printed above
# - "This should not be shown during import!" printed above
# - A file "guard-test-output.txt" would exist
# Since we see none of these, the directive guard worked correctly
