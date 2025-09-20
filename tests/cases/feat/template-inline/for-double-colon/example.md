# Inline /for in double-colon template

/var @items = ["A","B"]
/var @msg = ::
/for @x in @items
- @x
/end
::
/show @msg
