/exe @greet(name) = `Hello, @name!`
/exe @double(n) = js { return n * 2 }

/var @test_greet_works = @greet("Alice") == "Hello, Alice!"
/var @test_double_works = @double(5) == 10
/var @test_double_zero = @double(0) == 0