// Block user-uploaded data from dangerous operations
/guard before fileWrite = when [
  @input.mx.labels.includes('src:user-upload') =>
    deny "User uploads cannot be written to filesystem"
  * => allow
]

// Allow trusted database content through
/guard before apiCall = when [
  @input.mx.labels.includes('src:user-upload') =>
    deny "User data cannot call external APIs"
  @input.mx.labels.includes('src:dynamic') =>
    allow
  * => allow
]