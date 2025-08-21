/exe @stage1() = "Stage @ctx.stage, Input: [@ctx.input]"
/exe @stage2() = "Stage @ctx.stage, Input: [@ctx.input]"
/exe @stage3() = "Stage @ctx.stage, Input: [@ctx.input]"

/var @result = "initial" | @stage1 | @stage2 | @stage3
/show @result