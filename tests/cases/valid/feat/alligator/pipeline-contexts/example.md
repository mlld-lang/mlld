/exe @wrap(content, pre, post) = js { return pre + content + post; }
/exe @multi(a, b, c) = js { return `${a}[${b}]${c}`; }

// Function Arguments in Pipelines - Operators should remain as string literals
/var @test1 = "hello" | @wrap("<<", ">>")
/var @test2 = "world" | @wrap("<div>", "</div>")
/var @test3 = "data" | @wrap("!", "?")

// Nested Pipeline Arguments
/var @test4 = "core" | @multi("<<", "!=", ">>")
/var @test5 = "value" | @multi("<", "data", ">")

/show @test1
/show @test2
/show @test3
/show @test4
/show @test5