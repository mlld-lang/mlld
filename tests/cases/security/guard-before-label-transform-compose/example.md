# Before label guard composition applies each transform once

/guard before @first for secret = when [
  * => allow `A-@input`
]

/guard before @second for secret = when [
  * => allow `B-@input`
]

/var secret @token = "test"
/show `value: @token`
