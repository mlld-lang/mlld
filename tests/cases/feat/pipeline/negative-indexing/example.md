/exe @stageA(input) = `A:@input`
/exe @stageB(input) = `B:@input`
/exe @emitPrev(input, pipeline) = `prev=@p[-1] prev2=@p[-2]`

/var @result = "x" with { pipeline: [@stageA, @stageB, @emitPrev(@p)] }
/show @result

