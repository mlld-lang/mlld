/exe @concat(o, i) = `@o-@i`

/exe @pairwise(outers, inners) = for parallel(2) @o in @outers => for parallel(2) @i in @inners => @concat(@o, @i)

/var @out = @pairwise(["X","Y"], ["1","2"])
/show @out
