---
description: For loops with key/value bindings
---

/var @config = {"host": "localhost", "port": 3000}
/for @k, @v in @config => show `@k=@v`
/var @pairs = for @k, @v in @config => `@k:@v`
/var @legacy = for @v in @config => @v_key
/var @implicit = for @k, @v in @config => @v_key.isDefined()
/var @arrKeys = for @k, @v in [10] => @k

/show `Pairs: @pairs`
/show `Legacy keys: @legacy`
/show `Key/value implicit: @implicit`
/show `Array keys: @arrKeys`
