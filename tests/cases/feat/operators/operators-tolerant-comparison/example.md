/var @single = "alice@example.com"
/var @ordered = ["bob@example.com", "alice@example.com"]
/var @empty = "null"

/var @stringToArray = @single ~= ["alice@example.com"]
/var @subset = @single ~= ["alice@example.com", "bob@example.com"]
/var @unordered = @ordered ~= ["alice@example.com", "bob@example.com"]
/var @commaSeparated = "bob@example.com, alice@example.com" ~= ["alice@example.com", "bob@example.com"]
/var @nullLike = @empty ~= []
/var @numeric = "11" ~= 11
/var @negated = @single !~= ["mallory@example.com"]

/show "String to array: @stringToArray"
/show "Subset match: @subset"
/show "Order independent: @unordered"
/show "Comma separated: @commaSeparated"
/show "Null-like empty: @nullLike"
/show "Numeric coercion: @numeric"
/show "Negated mismatch: @negated"
