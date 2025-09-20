# Test /output with Alligator Content Load

This test verifies that /output handles LoadContentResult objects consistently with /show.

## Setup test file
/var @testContent = "This is the content of the test file"
/output @testContent "test-file.md"

## Test variable with alligator syntax
/var @myfile = <test-file.md>

## Test that /show displays the content (not the full object)
/show "Content via /show:"
/show @myfile

## Test that /output also outputs just the content (not the full object)
/output @myfile "output-result.txt"
/var @outputResult = <output-result.txt>
/show "Content via /output:"
/show @outputResult