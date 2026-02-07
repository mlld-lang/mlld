/guard @blockSecrets before secret = when [
  * => deny "No secrets in effects"
]

/var secret @key = "sk-123"
/var @arr = [@key]
/var @first = @arr[0]
@first | /show
