# Output with backtick template paths

/var @dir = "output-bt"
/var @name = "result"

/output "static content" to `@dir/@name\.txt`
/output "variable dir" to `@dir/fixed\.txt`

/var @read1 = <output-bt/result.txt>
/var @read2 = <output-bt/fixed.txt>
/show @read1
/show @read2
