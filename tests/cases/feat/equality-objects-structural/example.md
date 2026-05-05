>> Objects compare structurally for == and !=, mirroring arrays. Cycle and
>> depth guards prevent runaway recursion on pathological objects.
/var @flat = when [{ x: 1 } == { x: 1 } => "true"; * => "false"]
/var @nested = when [{ x: { y: 1 } } == { x: { y: 1 } } => "true"; * => "false"]
/var @diffVal = when [{ x: 1 } == { x: 2 } => "true"; * => "false"]
/var @diffKeys = when [{ x: 1 } == { x: 1, y: 2 } => "true"; * => "false"]
/var @diffKeyName = when [{ x: 1 } == { y: 1 } => "true"; * => "false"]
/var @arrOfObjects = when [[{ a: 1 }, { b: 2 }] == [{ a: 1 }, { b: 2 }] => "true"; * => "false"]
/var @objWithArrays = when [{ xs: [1, 2] } == { xs: [1, 2] } => "true"; * => "false"]
/var @arrayVsObject = when [[1] == { a: 1 } => "true"; * => "false"]
/var @emptyObj = when [{} == {} => "true"; * => "false"]
/var @objVsNull = when [{ x: 1 } == null => "true"; * => "false"]
/show `flat: @flat`
/show `nested: @nested`
/show `diff value: @diffVal`
/show `diff keys: @diffKeys`
/show `diff key name: @diffKeyName`
/show `array of objects: @arrOfObjects`
/show `object with arrays: @objWithArrays`
/show `array vs object: @arrayVsObject`
/show `empty objects: @emptyObj`
/show `object vs null: @objVsNull`
