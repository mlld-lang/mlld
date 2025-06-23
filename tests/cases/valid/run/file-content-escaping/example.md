# Test File Content in Commands

This tests passing file content to external commands.

/var @test_file = [test-file.md]

>> File content should be properly escaped when passed to commands
/run {echo "@test_file"}