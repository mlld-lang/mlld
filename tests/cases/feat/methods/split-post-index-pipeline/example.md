/var @foobar = "foo_bar"

/exe @wrap(s) = ::
X:@s
::

/show @foobar.split("_")[1] | @wrap

