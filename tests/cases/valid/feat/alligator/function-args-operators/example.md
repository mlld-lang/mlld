/exe @test(a, b) = js { return a + b; }

// Comparison Operators - Should parse as string literals, not file references
/var @result1 = @test("<<", ">>")
/var @result2 = @test("<=", ">=")           
/var @result3 = @test("!=", "==")           
/var @result4 = @test("~=", "!~")           

// Logical Operators  
/var @result5 = @test("&&", "||")           
/var @result6 = @test("!", "?")             
/var @result7 = @test(":", ";")             

// Compound Operators
/var @result8 = @test("<<=", ">>=")         
/var @result9 = @test("!==", "!<=")         
/var @result10 = @test("<<>>", "><><")      

/show @result1
/show @result2
/show @result3
/show @result4
/show @result5
/show @result6
/show @result7
/show @result8
/show @result9
/show @result10