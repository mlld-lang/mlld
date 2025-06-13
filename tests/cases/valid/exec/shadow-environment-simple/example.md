# Simple Shadow Environment Test

@exec double(x) = @run js [(x * 2)]

@exec js = { double }

@exec test(n) = @run js [(double(n))]

@data result = @test(10)
@add `Result: @result`