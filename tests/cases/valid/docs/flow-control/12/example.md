/var @names = ["Alice", "Bob", "Charlie"]
/exe @greeting(name) = :::{{name}}, welcome to the team!:::
/var @welcomes = foreach @greeting(@names)
/show @welcomes