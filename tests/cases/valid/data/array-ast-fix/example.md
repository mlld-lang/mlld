# Test Array AST Fix

>> Define array functions inline to test the fix
/exe @filter(array, key, value) = js {(
  Array.isArray(array) 
    ? array.filter(item => item[key] == value)
    : []
)}

/exe @find(array, key, value) = js {(
  Array.isArray(array) 
    ? array.find(item => item[key] == value) || null
    : null
)}

/exe @groupBy(array, key) = js {(
  Array.isArray(array) 
    ? array.reduce((groups, item) => {
        const group = String(item[key]);
        if (!groups[group]) groups[group] = [];
        groups[group].push(item);
        return groups;
      }, {})
    : {}
)}

/var @users = [
  {"name": "alice", "dept": "eng"},
  {"name": "bob", "dept": "sales"},
  {"name": "charlie", "dept": "eng"}
]

/var @engineers = @filter(@users, "dept", "eng")
/show `Engineers: @engineers`

/var @foundBob = @find(@users, "name", "bob")
/show `Found Bob: @foundBob`

/var @byDept = @groupBy(@users, "dept")
/show `Grouped by dept: @byDept`