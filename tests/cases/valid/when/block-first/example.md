/var @env = "production"
/var @isDev = ""
/var @isProd = "true"
/var @isTest = ""

/when first: [
  @isDev => @add "Dev mode"
  @isProd => @add "Prod mode"  
  @isTest => @add "Test mode"
]