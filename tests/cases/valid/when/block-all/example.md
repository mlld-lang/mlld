@data features = ["auth", "payments", "notifications"]

@when all:
  "auth" in @features => @add "Authentication enabled\n"
  "payments" in @features => @add "Payments enabled\n"
  "chat" in @features => @add "Chat enabled\n"
EOF < /dev/null