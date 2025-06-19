@data features = ["auth", "payments", "notifications"]

@text hasAuth = "true"
@text hasPayments = "true"
@text hasChat = ""

@when @hasAuth all: [
  @hasAuth => @add "Authentication enabled\n"
  @hasPayments => @add "Payments enabled\n"
  @hasChat => @add "Chat enabled\n"
]