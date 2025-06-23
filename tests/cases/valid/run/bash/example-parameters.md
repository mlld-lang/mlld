# Bash Code with Parameters

/exe @greeting(name, count) = bash {
echo "Hello, $name!"
echo "You are visitor number $count"
}

/run @greeting("Alice", 42)