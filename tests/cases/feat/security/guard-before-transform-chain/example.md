# Before guard transform chain - 3 before guards

/guard before @g1 for op:exe = when [
  * => allow "G1"
]

/guard before @g2 for op:exe = when [
  * => allow "G2"
]

/guard before @g3 for op:exe = when [
  * => allow "G3"
]

/exe @emit(value) = js { return value; }

/show @emit("raw")
