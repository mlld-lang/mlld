/var @env = "production"
/var @isDev = false
/var @isProd = true
/var @isTest = false

/when first [
  @isDev => show "Dev mode"
  @isProd => show "Prod mode"  
  @isTest => show "Test mode"
]