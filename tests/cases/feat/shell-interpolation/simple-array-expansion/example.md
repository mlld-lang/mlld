# Test: Simple Arrays Still Expand (Regression Test)

>> This test ensures we don't break the intended behavior of expanding
>> simple string arrays into multiple shell arguments

/var @files = ["file1.txt", "file2.txt", "file3.txt"]
/run { echo @files }
