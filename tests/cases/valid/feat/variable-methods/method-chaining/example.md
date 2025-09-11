# Variable Methods: Chaining and Field Access

/var @file = "src/path/to/file.txt"
/var @file_dir = "src/"
/var @parts = @file.split(@file_dir)

# Using dotted field access on method result via temp var
/show @parts.1

# Using bracket indexing on method result via temp var
/show @parts[1]
