# Guard Composition - Transform Provenance

/guard @sanitize for secret = when [
  * => allow @input.trim()
]

/var secret @raw = " padded "

/exe @inspect(val) = cmd {
  /show `sources: @val.mx.sources`
}

/show @inspect(@raw)
