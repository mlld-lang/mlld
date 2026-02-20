/exe @echo_name(name) = cmd {echo "Hello, @name!"}
/exe @contains_ada(text) = js { return text.includes("Ada"); }
/var @checks = { contains_ada: @contains_ada }

This line stays text: @echo_name("ignored")
This line stays text too: @checks.contains_ada("Ada Lovelace")

/@echo_name("World")
/@checks.contains_ada("Ada Lovelace")
