# Array vs Path Disambiguation Tests

## Single object is array
/var @obj = [{"type": "test"}]
/show @obj

## Single exec invocation is array  
/exe @getTime() = run {echo "12:00"}
/var @exec = [@getTime()]
/show @exec

## Single nested array is array
/var @nested = [[1, 2, 3]]
/show @nested

## Single string is path
/var @path = [array-path-disambiguation-test.md]
/show @path

## Absolute path is path
/var @absPath = [/etc/hosts]
/show `First 30 chars: @absPath`

## Path with spaces needs quotes
/var @spacePath = ["path with spaces.txt"]
/show @spacePath

## Multiple items always array
/var @multi1 = [array-path-disambiguation-test.md, array-path-disambiguation-section.md]
/show @multi1

## Comma makes it array
/var @comma = [{"single": "object"},]
/show @comma

## Section extraction syntax
/var @section = [array-path-disambiguation-section.md # section-name]
/show @section