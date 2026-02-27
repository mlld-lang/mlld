# Guard Composition - Transform Provenance

/var secret @raw = " padded "

/exe @inspect(val) = `sources: @val.mx.sources`

/guard @sanitize for secret = when [
  * => allow @input.trim()
]

/show @inspect(@raw)
