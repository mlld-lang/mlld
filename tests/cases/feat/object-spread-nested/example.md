# Test: Object Spread Nested

/var @address = {"city": "Paris", "country": "FR"}
/var @user = { "name": "Alice", "address": { ...@address, country: "France" } }
/show @user
