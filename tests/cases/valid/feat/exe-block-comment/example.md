/exe @router(message) = [
  >> Build routing context from agent tldrs
  let @result = "test"
  
  >> Another comment after let
  => @result
]

/show @router("hello")
