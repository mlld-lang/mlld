/exe @wrap(x) = `[@x]`
/exe @wrapAll(items) = foreach @wrap(@items)
/show @wrapAll(["a","b"]) | @join(',')   # => [a],[b]