/var @users = [
  {"name": "alice", "dept": "eng", "active": true},
  {"name": "bob", "dept": "design", "active": false},
  {"name": "charlie", "dept": "eng", "active": true}
]

# Import array functions
/import { filter, find, groupBy, pluck, sortBy } from @mlld/array

# Test filtering by string field
/var @engineers = @filter(@users, "dept", "eng")
/show `Engineers: @engineers`

# Test finding by string field  
/var @bob = @find(@users, "name", "bob")
/show `Bob: @bob`

# Test grouping by string field
/var @byDept = @groupBy(@users, "dept") 
/show `By department: @byDept`

# Test plucking string field
/var @names = @pluck(@users, "name")
/show `Names: @names`

# Test sorting by string field
/var @sorted = @sortBy(@users, "name")
/show `Sorted: @sorted`