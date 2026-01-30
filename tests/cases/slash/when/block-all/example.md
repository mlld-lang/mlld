/var @features = ["auth", "payments", "notifications"]

/var @hasAuth = "true"
/var @hasPayments = "true"
/var @hasChat = ""

# Using bare when to execute the first matching condition
/when [
  @hasAuth => show "Authentication enabled"
  @hasPayments => show "Payments enabled"
  @hasChat => show "Chat enabled"
]
