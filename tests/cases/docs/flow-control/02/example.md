/var @role = "admin"
/when first [
  @role == "admin" => show "✓ Admin access granted"
  @role == "user" => show "User access granted"
  * => show "Access denied"
]