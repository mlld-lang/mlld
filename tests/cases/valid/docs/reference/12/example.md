/exe @getAccess(user) = when first [
  @user.role == "admin" => "full"
  @user.verified && @user.premium => "premium"
  @user.verified => "standard"
  * => "limited"
]

/var @access = @getAccess(@currentUser)