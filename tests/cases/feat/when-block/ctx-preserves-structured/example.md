# When-expression preserves structured file values

/var @file = <when-block-ctx-meta-test.txt>
/var @out = when first [
  * => @file
]
/show @out.ctx.filename
/show @out.text.trim()

