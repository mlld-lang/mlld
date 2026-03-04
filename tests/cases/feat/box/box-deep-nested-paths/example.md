/var @box-dnp = box [
  file "deep/nested/path/file.txt" = "deep-content"
  let @r = run cmd { cat deep/nested/path/file.txt }
  => @r
]
/show @box-dnp