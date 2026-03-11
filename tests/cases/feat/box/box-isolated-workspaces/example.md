/files <@box-iso1/> = [{ "a.txt": "from-resolver-1" }]
/files <@box-iso2/> = [{ "a.txt": "from-resolver-2" }]

/var @r1 = box @box-iso1 [
  let @v = run cmd { cat a.txt }
  => @v
]

/var @r2 = box @box-iso2 [
  let @v = run cmd { cat a.txt }
  => @v
]

/show @r1
/show @r2