>> List all definition names
/var @names = <api.ts { ?? }>
/show @names.join(", ")                         # "createUser, deleteUser, User, Status"

>> List specific types
/var @funcNames = <api.ts { fn?? }>            # Function names only
/var @classNames = <api.ts { class?? }>        # Class names only
/var @varNames = <api.ts { var?? }>            # Variable names only