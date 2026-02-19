exe llm @processFile(path) = run cmd { claude -p "review @path" }

var @results = for parallel(10) @path in @files [
  => @processFile(@path)
]

show @results
