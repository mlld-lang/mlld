/guard @blocker before secret = when [
  * => deny "should skip"
]

/guard @allowed before secret = when [
  * => allow
]

/var secret @data = "visible"
/show @data with { guards: { except: ["@blocker"] } }  # Only @allowed runs