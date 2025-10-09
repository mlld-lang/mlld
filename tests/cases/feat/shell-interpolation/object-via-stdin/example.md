# Test: Object via Stdin

/var @config = {"database": "postgres", "port": 5432}
/run { cat } with { stdin: @config }
