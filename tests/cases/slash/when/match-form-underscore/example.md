/var @userRole = "guest"
/var @adminRole = "admin" 
/var @hasPermission = "false"

# Testing match form (value comparison)
>> @userRole's value ("guest") is compared to each literal condition
>> Only exact matches fire - "_" is not a wildcard in match form
/when @userRole: [
  "guest" => show "User is a guest"
  "admin" => show "User is an admin"
  "_" => show "User has unknown role"
]

/when @hasPermission: [
  "true" => show "Permission granted"
  "false" => show "No permission granted"
]
