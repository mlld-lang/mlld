# Shell commands
/exe @greet(name) = run {echo "Hello @name"}
/exe @deploy() = sh {
  npm test && npm run build
  ./deploy.sh
}

# JavaScript functions
/exe @add(a, b) = js { return a + b }
/exe @processData(data) = js {
  return data.map(item => item.value * 2)
}

# Templates
/exe @welcome(name, role) = ::Welcome @name! Role: @role::
/exe @format(title, content) = :::
# {{title}}

{{content}}
:::

# Invoke executables
/run @greet("Bob")
/var @sum = @add(10, 20)
/show @welcome("Alice", "Admin")