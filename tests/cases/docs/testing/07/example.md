/var @user = {"role": "admin", "active": true}
/var @result = ""

/when [
  @user.role == "admin" && @user.active => var @result = "admin-access"
  @user.role == "user" => var @result = "user-access"
  none => var @result = "no-access"
]

/var @test_admin_access = @result == "admin-access"