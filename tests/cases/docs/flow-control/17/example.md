/for @user in @users [
  let @status = when [
    @user.active => "active"
    * => "inactive"
  ]
  show "@user.name: @status"
]