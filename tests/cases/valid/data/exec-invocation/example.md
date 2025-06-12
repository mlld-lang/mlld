@exec getVersion = @run [(echo "1.0.0")]
@exec getFiles(dir, pattern) = @run [(echo '[{"name":"file1.txt"},{"name":"file2.txt"}]')]
@exec calculate(a, b) = @run node [(console.log(Number(a) + Number(b)))]

@data version = @getVersion()
@data files = @getFiles(".", "*.txt")
@data sum = @calculate(5, 3)

@add [[Version: {{version}}]]
@add @files
@add [[Sum: {{sum}}]]