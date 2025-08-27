/var @user = {"name": "Alice", "scores": [10, 20, 30]}

>> Object fields
/show @user.name                         >> "Alice"

>> Array elements by index
/show @user.scores.0                     >> 10
/show @user.scores.1                     >> 20

>> Nested access
/var @config = {"db": {"host": "localhost", "users": ["admin", "guest"]}}
/show @config.db.host                    >> "localhost"
/show @config.db.users.1                 >> "guest"