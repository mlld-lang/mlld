>> Files
# templates/welcome.att   -> Hello @name! Title: @title
# templates/note.mtt      -> Note: {{body}}

>> Define executables from files
/exe @welcome(name, title) = template "./templates/welcome.att"
/exe @note(body)           = template "./templates/note.mtt"

>> Invoke with parameters
/show @welcome("Alice", "Engineer")
/show @note("Bring snacks")