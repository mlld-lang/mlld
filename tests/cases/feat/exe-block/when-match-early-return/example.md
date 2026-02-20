/exe @route(action) = [
  when @action [
    "greet" => "Hello!"
    "bye" => "Goodbye!"
  ]
  => "unknown"
]
/show @route("greet")
/show @route("bye")
/show @route("other")
