/var @result = @data | @validate | @process
/when [
  @result.success => output @result.data to "output.json"
  !@result.success => show `Processing failed: @result.error`
]