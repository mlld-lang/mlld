/var @str = "foo_bar"

/exe @process(str) = ::
@str.split("_")[1]
::

/show @process("foo_bar")

