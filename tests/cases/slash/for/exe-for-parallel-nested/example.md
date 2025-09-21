/exe @concat(o, i) = `@o-@i`

/exe @pairwise(outers, inners) = for 2 parallel @o in @outers => for 2 parallel @i in @inners => @concat(@o, @i)

/var @out = @pairwise(["X","Y"], ["1","2"])
/show @out

