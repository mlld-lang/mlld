/var @userRole = "guest"
/var @adminRole = "admin" 
/var @hasPermission = false

# Testing negation in switch form

/when @userRole: [
  !"admin" => show "User is not an admin"
  !"guest" => show "User is not a guest"
  "guest" => show "User is a guest"
]

/when @hasPermission: [
  !false => show "This should not appear"
false => show "No permission granted"
]