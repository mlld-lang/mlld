/exe @simpleTemplate(name) = `Hello, @name!`

/exe @conditionalTemplate(type, name) = [
  when @type [
    "greeting" => [
      let @r = @simpleTemplate(@name)
      => @r
    ]
    * => "unknown"
  ]
]

/show @conditionalTemplate("greeting", "Ada")
