/guard @blockSecrets before secret = when [
  * => deny "No secrets in effects"
]

/var secret @value = "secret-show"

@value | show
