---
name: greetings
author: alice
version: 1.0.0
about: Simple greeting utilities
needs: []
license: CC0
---

/exe @sayHello(name) = `Hello, @name!`
/exe @sayGoodbye(name) = `Goodbye, @name!`

/export { @sayHello, @sayGoodbye }