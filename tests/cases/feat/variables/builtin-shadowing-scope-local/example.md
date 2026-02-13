/exe @localShadow() = [
  let @exists = "user-local"
  => @exists
]

/show @localShadow()
/show @exists("definitely-missing-file-for-shadow-test.txt")
