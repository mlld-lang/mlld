/exe @processData(type, data) = when: [
  @type == "json" => @jsonProcessor(@data) 
  @type == "xml" => @xmlProcessor(@data)
  true => @genericProcessor(@data) << comment
]