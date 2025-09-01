/exe @up(input) = js { return input.toUpperCase(); }

/var @src = "abc"

# Pipe syntax
/show @src | @up

# With-clause syntax
/var @tmp = @src with { pipeline: [@up] }
/show @tmp

