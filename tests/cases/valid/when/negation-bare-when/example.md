/var @userRole = "guest"
/var @adminRole = "admin" 
/var @hasPermission = "false"

# Testing bare when form (not a switch)
/when @userRole: [
  "guest" => show "User is a guest"
  "admin" => show "User is an admin"
  "_" => show "User has unknown role"
]

/when @hasPermission: [
  "true" => show "Permission granted"
  "false" => show "No permission granted"
]