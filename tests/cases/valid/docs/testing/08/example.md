/var @numbers = [1, 2, 3, 4, 5]
/exe @square(n) = js { return n * n }

# Test foreach transformation
/var @squared = foreach @square(@numbers)
/var @test_foreach_length = @squared.length() == 5
/var @test_first_square = @squared[0] == 1
/var @test_last_square = @squared[4] == 25

# Test for loop collection
/var @doubled = for @n in @numbers => js { return @n * 2 }
/var @test_doubled_sum = @doubled[0] + @doubled[1] == 6  # 2 + 4