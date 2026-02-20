/exe @stage1() = `Stage 1 output`
/exe @stage2(x) = `Stage 2: @x`
/exe @stage3(x) = `Stage 3: @x, Previous: @p[-1]`
/var @result = @stage1 | @stage2 | @stage3
/show @result
