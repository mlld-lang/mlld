# This variable is a test
/var @test_basic_math = 2 + 2 == 4

# This variable is not a test
/var @helper_data = [1, 2, 3]

# This is also a test
/var @test_array_length = @helper_data.length() == 3