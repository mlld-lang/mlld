/guard @blockSecrets before secret = when [
  * => deny "No secrets in effects"
]

/var secret @key = "sk-123"
/var @arr = [@key, "public"]
/var @mapped = for @item in @arr => @item
/show @mapped
