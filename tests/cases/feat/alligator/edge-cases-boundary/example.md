/exe @test(a, b) = js { return a + b; }

// Empty and Minimal Cases
/var @edge1 = @test("<", ">")
/var @edge2 = @test("", "<>")
/var @edge3 = @test("<<>>", "")

// Escaped Characters  
/var @escaped1 = @test("\\<", "\\>")
/var @escaped2 = @test("\\<<", "\\>>")

// Malformed Patterns
/var @malformed1 = @test("<no-closing", "no-opening>")
/var @malformed2 = @test("<<>><<", ">><<>>")

/show @edge1
/show @edge2
/show @edge3
/show @escaped1
/show @escaped2
/show @malformed1
/show @malformed2