/var @status = "active"
/var @enabled = false

# Testing negation in switch form

>> Test string negation
/when @status first: [
  !"inactive" => /show "Status is not inactive"
  "active" => /show "Status is active"
]

>> Test boolean negation
/when @enabled first: [
  !false => /show "Is not false (meaning it's true)"
  false => /show "Is false"
]

>> Test with actual false value
/var @disabled = false
/when @disabled first: [
  !true => /show "Not true (so it's false)"
  !false => /show "Not false (so it's true)"
  false => /show "Is false"
]