/guard before secret = when [
  * => deny "secret-blocked"
]

/show "local-ok"
/var secret @token = "super-secret"
/show @token
