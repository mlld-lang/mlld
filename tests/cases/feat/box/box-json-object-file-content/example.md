/var @result = box [
  file "config.json" = { "name": "test", "version": 1 }
  let @r = run cmd { cat config.json }
  => @r
]
/show @result