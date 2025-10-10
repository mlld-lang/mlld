# Test: Object Spread Basic

/var @user = {"name": "Alice", "role": "user"}
/var @admin = { ...@user, role: "admin" }
/show @admin
