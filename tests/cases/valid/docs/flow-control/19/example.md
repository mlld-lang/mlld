/var @validation = @validate(@input)
/when [
  @validation.valid => show "Processing successful"
  !@validation.valid => show `Error: @validation.message`
]