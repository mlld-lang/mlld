/var @userRole = "guest"
/var @adminRole = "admin" 
/var @hasPermission = false

# Testing negation in switch form

>> Negated string literals in switch form are not supported
>> This test case needs to be moved to unsupported features
/when @userRole: [
  "guest" => show "User is a guest"
  "admin" => show "User is an admin"
  _ => show "User has unknown role"
]

/when @hasPermission: [
  true => show "Permission granted"
  false => show "No permission granted"
]