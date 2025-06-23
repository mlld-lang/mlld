/exe @getVersion = {echo "1.0.0"}
/exe @getFiles(dir, pattern) = {echo '[{"name":"file1.txt"},{"name":"file2.txt"}]'}
/exe @calculate(a, b) = node {console.log(Number(a) + Number(b))}

/var @version = @getVersion()
/var @files = @getFiles(".", "*.txt")
/var @sum = @calculate(5, 3)

/show [[Version: {{version}}]]
/show @files
/show [[Sum: {{sum}}]]