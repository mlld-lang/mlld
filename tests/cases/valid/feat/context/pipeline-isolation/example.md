/exe @counter() = "Attempt @ctx.try"

/var @pipeline1 = "test" | @counter
/var @pipeline2 = "test" | @counter
/var @pipeline3 = "test" | @counter

/show @pipeline1
/show @pipeline2
/show @pipeline3