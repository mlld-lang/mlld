/var @files = <for-expression-load-mx-*.md>
/var @mapped = for @f in @files => @f
/var @names = for @m in @mapped => @m.mx.filename
/var @filtered = for @f in @files when @f.mx.filename == "for-expression-load-mx-a.md" => @f
/var @filteredNames = for @m in @filtered => @m.mx.filename
/show @names
/show @filteredNames
