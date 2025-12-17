# When-expression preserves structured file values

/var @file = <when-block-mx-meta-test.txt>
/var @out = when first [
  * => @file
]
/show @out.mx.filename
/show @out.text.trim()

