// TTL SYNTAX - Time-to-live cache duration
// Used by: @path and @import directives
// Purpose: Parse cache duration specifications

// TTLClause is a simpler version that returns just the TTL value
// (Unlike TTLOption which returns the full option structure)
TTLClause "TTL clause"
  = "(" _ ttl:TTLValue _ ")" { return ttl; }