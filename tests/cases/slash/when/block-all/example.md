/var @features = ["auth", "payments", "notifications"]

/var @hasAuth = "true"
/var @hasPayments = "true"
/var @hasChat = ""

# Using when block to execute the first matching condition
/when [
  @hasAuth => show "Authentication enabled"
  @hasPayments => show "Payments enabled"
  @hasChat => show "Chat enabled"
]
