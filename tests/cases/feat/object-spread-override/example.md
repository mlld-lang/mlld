# Test: Object Spread Override

/var @user = {"name": "Alice", "role": "user"}
/var @overrides = {"role": "admin", "active": true}
/var @admin = { ...@user, ...@overrides }
/show @admin
