/guard @blockSecrets before secret = when [
  * => deny "No secrets in effects"
]

/var secret @key = "sk-123"
/var @arr = [@key]
/exe @extract(arr) = [=> @arr[0]]
/var @leaked = @extract(@arr)
/show @leaked
