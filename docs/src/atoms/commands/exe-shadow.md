---
id: exe-shadow
title: Exe Shadow Environments
brief: Expose helpers to all code blocks (JS, Node, Python)
category: commands
parent: exe
tags: [functions, javascript, python, node, environment, reusable]
related: [exe-simple, run-basics]
related-code: [interpreter/eval/exe.ts, interpreter/env/NodeShadowEnvironment.ts, interpreter/env/PythonShadowEnvironment.ts]
updated: 2026-01-22
---

**Shadow environments** expose helpers to all code blocks of that language:

```mlld
>> JavaScript shadow environment
exe @double(n) = js { return n * 2 }
exe @cap(s) = js { return s[0].toUpperCase() + s.slice(1) }
exe js = { double, cap }  >> expose to all js blocks

var @out = js { cap("hello") + ": " + double(5) }  >> "Hello: 10"
```

```mlld
>> Python shadow environment
exe @square(x) = py {
result = int(x) ** 2
print(result)
}
exe @greet(name) = py {
print(f"Hello, {name}!")
}
exe py = { square, greet }  >> expose to all py blocks

run py {
square(4)      >> prints 16
greet("World") >> prints Hello, World!
}
```

**Cross-function calls:** Shadow functions can call each other:

```mlld
exe @add(a, b) = py { print(int(a) + int(b)) }
exe @multiply(x, y) = py { print(int(x) * int(y)) }
exe py = { add, multiply }

exe @calculate(n) = py {
sum_result = add(n, 10)   >> calls shadow function
product = multiply(n, 2)  >> calls shadow function
print(f"Sum: {sum_result}, Product: {product}")
}
exe py = { add, multiply, calculate }  >> update to include calculate
```

**Supported languages:** `js`, `node`, `py`/`python`
