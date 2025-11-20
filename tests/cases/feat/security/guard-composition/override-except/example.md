# Guard Composition - Override Except

/guard @blocker for secret = when [
  * => deny "should skip"
]

/guard @allowed for secret = when [
  * => allow
]

/var secret @payload = "visible"

/show @payload with { guards: { except: ["@blocker"] } }
