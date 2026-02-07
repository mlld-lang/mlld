/guard @blockSecrets before secret = when [
  * => deny "No secrets in effects"
]

/var secret @key = "sk-123"
/var @obj = { text: @key }
/var @val = @obj.text
@val | /show
