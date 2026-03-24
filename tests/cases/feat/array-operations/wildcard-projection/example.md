/var @tools = [{"name": "readData", "id": 1}, {"name": "debiasedEval", "id": 2}, {"name": "sendEmail", "id": 3}]

>> Project name field across all elements
/var @names = @tools[*].name
/show @names

>> Project nested id field
/var @ids = @tools[*].id
/show @ids

>> Use projected array with .includes()
/var @hasEval = @tools[*].name.includes("debiasedEval")
/show @hasEval

/var @hasMissing = @tools[*].name.includes("notATool")
/show @hasMissing
