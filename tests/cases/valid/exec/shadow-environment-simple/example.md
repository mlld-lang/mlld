# Simple Shadow Environment Test

/exec @double(x) = js {x * 2}

/exec @js = { double }

/exec @test(n) = js {double(n)}

/data @result = @test(10)
/add `Result: @result`