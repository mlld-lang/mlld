# Example: Actions in /exe when expressions

This shows the incorrect use of action directives inside /exe when expressions.

/exe @validate(answer) = when: [
  @isjson(@answer) => @answer
  !@isjson(@answer) => /show `Invalid JSON`  >> This is wrong - can't use /show here
  * => /show `Error`  >> This is also wrong
]