/guard @blockSecrets before secret = when [
  * => deny "No secrets in effects"
]

/var secret @key = "sk-123"
/var @outer = { inner: { val: @key } }
/var @deep = @outer.inner.val
/show @deep
