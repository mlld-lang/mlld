/var @name = "Alice"
/var @language = "JavaScript"

>> Test backticks in double colon template
/var @docs = ::The `getData()` function returns @language data::
/show @docs

>> Test multiple variables
/var @message = ::Hello @name! Welcome to `mlld` documentation::
/show @message

>> Test inline code examples
/var @example = ::To use this feature, run `npm install` and then call `init(@name)`::
/show @example