/var @features = ["auth", "payments", "notifications"]

/var @hasAuth = "true"
/var @hasPayments = "true"
/var @hasChat = ""

/when @hasAuth all: [
  @hasAuth => @add "Authentication enabled\n"
  @hasPayments => @add "Payments enabled\n"
  @hasChat => @add "Chat enabled\n"
]