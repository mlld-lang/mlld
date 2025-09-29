/exe @upper(text) = js { return text.toUpperCase(); }
/exe @exclaim(text) = js { return text + "!"; }

>> BUG: Pipeline lost here
/exe @shout(text) = @upper(@text) | @exclaim

/var @result = @shout("hello")
/show @result