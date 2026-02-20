# Node new expression partials

/import { posix } from node @path
/var @strip = new @posix.basename("/tmp/mlld-node.txt")
/var @result = @strip(".txt")
/show @result
