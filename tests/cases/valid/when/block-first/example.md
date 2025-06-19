@text env = "production"
@text isDev = ""
@text isProd = "true"
@text isTest = ""

@when first: [
  @isDev => @add "Dev mode"
  @isProd => @add "Prod mode"  
  @isTest => @add "Test mode"
]