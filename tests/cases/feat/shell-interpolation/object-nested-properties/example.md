# Test: Object with Nested Properties

>> Objects with nested objects should be properly JSON.stringify'd

/var @config = {"server": {"host": "localhost", "port": 8080}, "debug": true}
/run { echo @config }
