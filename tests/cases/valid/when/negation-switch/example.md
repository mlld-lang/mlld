/text @userRole = "guest"
/text @adminRole = "admin" 
/data @hasPermission = false

# Testing negation in switch form

/when @userRole: [
  !"admin" => @add "User is not an admin"
  !"guest" => @add "User is not a guest"
  "guest" => @add "User is a guest"
]

/when @hasPermission: [
  !false => @add "This should not appear"
false => @add "No permission granted"
]