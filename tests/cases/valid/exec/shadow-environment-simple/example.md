# Simple Shadow Environment Test

/exe @double(x) = js {x * 2}

/exe js = { double }

/exe @test(n) = js {double(n)}

/var @result = @test(10)
/show `Result: @result`