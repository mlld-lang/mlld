/when first [
  @role == "admin" => show "Admin access"
  @role == "user" => show "User access"
  * => show "Guest access"
]