/exe @validateInput(data) = when first [
  @data == null => "Error: null input"
  @data.length > 1000 => "Error: input too long" 
  @data.includes("<script") => "Error: potentially malicious"
  * => @data
]