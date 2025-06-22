# Test: Bracket Nesting in Code Blocks

## Test various bracket nesting scenarios in code blocks

### Python with arrays
/run python {data = [1, 2, 3]
print(data[0])
}

### JavaScript with objects and arrays  
/run javascript {const config = {
  items: [1, 2, 3],
  nested: { values: [4, 5, 6] }
};
console.log(config.items[0]);
}

### Complex Python data structures
/run python {data = [
  {"name": "test", "values": [1, 2, 3]},
  {"name": "prod", "values": [4, 5, 6]}
]
for item in data:
  print(f"Processing {item['name']}: {item['values']}")
}

### Bash with test conditions
/run sh {if [ -f "file.txt" ]; then
  echo "File exists"
  cat "file.txt" | grep "pattern"
fi
}