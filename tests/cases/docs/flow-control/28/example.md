/var @files = ["config.json", "data.json", "users.json"]
/exe @processFile(file) = when first [
  @file.endsWith(".json") => `Processed: @file`
  * => `Skipped: @file`
]
/var @results = foreach @processFile(@files)
/for @result in @results => show @result