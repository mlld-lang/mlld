# Test: Object Spread Multiple Sources

/var @base = {"a": 1}
/var @extra = {"b": 2}
/var @more = {"c": 3}
/var @result = { ...@base, ...@extra, ...@more }
/show @result
