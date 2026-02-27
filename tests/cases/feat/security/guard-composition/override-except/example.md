# Guard Composition - Override Except

/var secret @payload = "visible"

/guard @blocker for secret = when [
  * => deny "should skip"
]

/guard @allowed for secret = when [
  * => allow
]

/show @payload with { guards: { except: ["@blocker"] } }
