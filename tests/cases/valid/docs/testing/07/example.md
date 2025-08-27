/var @user = {"role": "admin", "active": true}
/var @result = ""

/when [
  @user.role == "admin" && @user.active => @result = "admin-access"
  @user.role == "user" => @result = "user-access"
  none => @result = "no-access"
]

/var @test_admin_access = @result == "admin-access"