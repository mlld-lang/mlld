# Test: Object Spread Positions

/var @base = {"a": 1, "c": 3}
/var @result = { start: true, ...@base, end: true }
/show @result
