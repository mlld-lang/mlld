@text env = "production"

@when first:
  @env == "development" => @add "Dev mode"
  @env == "production" => @add "Prod mode"
  @env == "test" => @add "Test mode"
EOF < /dev/null