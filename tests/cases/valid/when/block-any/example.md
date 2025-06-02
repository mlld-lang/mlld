@data user = { "role": "guest", "verified": false }

@when any:
  @user.role == "admin"
  @user.role == "moderator"
  @user.verified == true
=>
  @add "Access granted"
EOF < /dev/null