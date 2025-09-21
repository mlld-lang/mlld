# Test command-reference imports and module environment capture

# Test direct function calls work
Direct getData: apple,banana,cherry
Direct formatData: test | data
# Test command-reference function that calls siblings
Command-ref processData: apple | banana | cherry
