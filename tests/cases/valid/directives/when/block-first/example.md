/var @env = "production"
/var @isDev = ""
/var @isProd = "true"
/var @isTest = ""

/when first: [
  @isDev => show "Dev mode"
  @isProd => show "Prod mode"  
  @isTest => show "Test mode"
]