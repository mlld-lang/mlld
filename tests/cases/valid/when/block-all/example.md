/var @features = ["auth", "payments", "notifications"]

/var @hasAuth = "true"
/var @hasPayments = "true"
/var @hasChat = ""

/when @hasAuth all: [
  @hasAuth => /show "Authentication enabled\n"
  @hasPayments => /show "Payments enabled\n"
  @hasChat => /show "Chat enabled\n"
]