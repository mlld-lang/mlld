# Nested For Loop - Basic

/var @outer = ["A", "B"]
/var @inner = [1, 2, 3]

/for @x in @outer => for @y in @inner => show "@x-@y"