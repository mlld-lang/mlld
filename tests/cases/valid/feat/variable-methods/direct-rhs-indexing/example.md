# Variable Methods: Direct RHS Indexing and Slicing

/var @file = "src/path/to/file.txt"
/var @file_dir = "src/"

# Direct bracket index on method result
/var @one = @file.split(@file_dir)[1]
/show @one

# Direct slice on method result
/var @slice = @file.split("/")[2:3]
/show @slice

# Direct numeric field access after method call
/var @two = @file.split(@file_dir).1
/show @two

# Variable index and mixed chaining
/var @i = 1
/var @viaVar = @file.split("/")[@i]
/show @viaVar

/var @mix = @file.split("/")[1:3].0
/show @mix

# Exec function that returns an array; index and dot-numeric after call
/exe @parts(s) = js { return s.split('/') }
/var @m1 = @parts(@file)[2]
/show @m1
/var @m2 = @parts(@file).3
/show @m2
