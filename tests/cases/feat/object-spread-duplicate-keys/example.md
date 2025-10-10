# Test: Object Spread Duplicate Keys

/var @base = {"role": "user"}
/var @result = { role: "guest", ...@base, role: "admin" }
/show @result
