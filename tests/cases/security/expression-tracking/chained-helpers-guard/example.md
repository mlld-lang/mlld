/guard @trimChainBlock for secret = when [
  * => deny "No secrets via chained helpers"
]

/var secret @key = "  sk-trim-98765  "
/var @trimmed = @key.trim().slice(0, 5)
/show @trimmed
