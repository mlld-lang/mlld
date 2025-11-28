>> Single file - returns plain string array
/var @names = <api.ts { ?? }>
/show @names.join(", ")                         # "createUser, deleteUser, User, Status"

>> List specific types
/var @funcNames = <api.ts { fn?? }>            # Function names only
/var @classNames = <api.ts { class?? }>        # Class names only
/var @varNames = <api.ts { var?? }>            # Variable names only

>> Glob patterns - returns per-file structured results
/var @pythonClasses = <**/*.py { class?? }>
/for @file in @pythonClasses => show "@file.names.length classes in @file.relative"
# Output:
# 3 classes in ./models/user.py
# 2 classes in ./services/auth.py