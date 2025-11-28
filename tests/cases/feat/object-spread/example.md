/var @baseObj = {"name": "Alice", "role": "user"}
/var @extra = {"age": 30}

/var @spread1 = { ...@baseObj }
/show `spread1: @spread1|@json`

/var @spread2 = { ...@baseObj, ...@extra }
/show `spread2: @spread2|@json`

/var @spread3 = { ...@baseObj, role: "admin" }
/show `spread3: @spread3|@json`

/var @spread4 = { role: "guest", ...@baseObj }
/show `spread4: @spread4|@json`

/var @spread5 = { x: "new", ...@baseObj, y: "also" }
/show `spread5: @spread5|@json`
