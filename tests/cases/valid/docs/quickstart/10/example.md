/var @role = "admin"
/when first [
  @role == "admin" => show "Full access granted"
  @role == "user" => show "Limited access"
  * => show "Guest access"
]