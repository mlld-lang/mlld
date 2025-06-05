# Edge Case Scenario: Stress Testing

## Scenario Description
Push mlld to its limits with large data sets, deep nesting, and complex operations to identify performance bottlenecks and failure modes.

## Test Categories

### 1. Large Data Processing

Create `large-data.mld`:

```mlld
# Generate large array
@data numbers = @run [seq 1 10000 | jq -s '.']

# Process each number
@text format_number(n) = [[Number: {{n}} squared is {{squared}}]]
@exec square(n) = @run [echo "$(({{n}} * {{n}}))" ]

# This will create 10,000 operations
@data results = foreach @format_number(@numbers) with {
  pipeline: [@square]
}

# Try to render all results (this might fail or be slow)
@add [[
# Large Data Test Results

Total numbers processed: {{numbers.length}}

First 10 results:
{{results.0}}
{{results.1}}
{{results.2}}
{{results.3}}
{{results.4}}
{{results.5}}
{{results.6}}
{{results.7}}
{{results.8}}
{{results.9}}

Last result: {{results.9999}}
]]
```

**Test Points:**
- [ ] Does it complete?
- [ ] Time taken?
- [ ] Memory usage?
- [ ] Output file size?

### 2. Deep Nesting Test

Create `deep-nesting.mld`:

```mlld
# Create deeply nested data structure
@data level1 = {
  "level2": {
    "level3": {
      "level4": {
        "level5": {
          "level6": {
            "level7": {
              "level8": {
                "level9": {
                  "level10": {
                    "level11": {
                      "level12": {
                        "level13": {
                          "level14": {
                            "level15": {
                              "level16": {
                                "level17": {
                                  "level18": {
                                    "level19": {
                                      "level20": "deep value"
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

# Test deep field access
@text deep = @level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.level11.level12.level13.level14.level15.level16.level17.level18.level19.level20

@add [[Deep value: {{deep}}]]

# Test in template
@add [[Inline access: {{level1.level2.level3.level4.level5.level6.level7.level8.level9.level10.level11.level12.level13.level14.level15.level16.level17.level18.level19.level20}}]]
```

**Test Points:**
- [ ] Parser handles deep nesting?
- [ ] Field access works?
- [ ] Performance impact?
- [ ] Error messages clear?

### 3. Recursive Import Test

Create multiple files that import each other:

**file1.mld**:
```mlld
@import { var2, var3 } from "./file2.mld"
@import { var5 } from "./file3.mld"
@text var1 = "From file 1"
@text combined1 = [[{{var1}} - {{var2}} - {{var3}} - {{var5}}]]
```

**file2.mld**:
```mlld
@import { var1 } from "./file1.mld"
@import { var4 } from "./file3.mld"
@text var2 = "From file 2"
@text var3 = "Also from file 2"
@text combined2 = [[{{var1}} - {{var2}} - {{var4}}]]
```

**file3.mld**:
```mlld
@import { var1 } from "./file1.mld"
@import { var2 } from "./file2.mld"
@text var4 = "From file 3"
@text var5 = "Also from file 3"
```

**Test Points:**
- [ ] Circular imports detected?
- [ ] Error message helpful?
- [ ] Partial imports work?
- [ ] Memory leaks?

### 4. Many Files Test

Create a script to generate many mlld files:

```bash
#!/bin/bash
# Create 100 module files
for i in {1..100}; do
  cat > "module$i.mld" << EOF
@text module${i}_name = "Module $i"
@text module${i}_version = "1.0.$i"
@data module${i}_data = {
  "id": $i,
  "name": "Module $i",
  "dependencies": [$([ $i -gt 1 ] && echo "\"module$(($i-1))\"" || echo "")]
}
EOF
done

# Create main file that imports all
cat > "main.mld" << 'EOF'
@import { * } from "./module1.mld"
@import { * } from "./module2.mld"
# ... repeat for all 100

@add [[Loaded {{module1_name}} through {{module100_name}}]]
EOF
```

**Test Points:**
- [ ] Import performance?
- [ ] Memory usage?
- [ ] Variable namespace pollution?
- [ ] Error handling?

### 5. Infinite Loop Detection

Create `infinite-loop.mld`:

```mlld
# Attempt 1: Circular variable reference
@text a = @b
@text b = @c  
@text c = @a
@add @a

# Attempt 2: Recursive template
@text recursive(x) = [[Start {{x}} - {{recursive}} - End]]
@add @recursive("test")

# Attempt 3: Infinite foreach
@data infinite = [1]
@text expand(x) = @infinite  
@data result = foreach @expand(@infinite)
```

**Test Points:**
- [ ] Detection mechanism works?
- [ ] Error messages clear?
- [ ] Process terminates cleanly?
- [ ] No resource leaks?

### 6. Memory Exhaustion Test

Create `memory-test.mld`:

```mlld
# Create very large string
@text repeat = "A"
@text double(s) = [[{{s}}{{s}}]]

# Double the string 20 times (2^20 = 1M characters)
@text x1 = @double(@repeat)
@text x2 = @double(@x1)
@text x3 = @double(@x2)
@text x4 = @double(@x3)
@text x5 = @double(@x4)
@text x6 = @double(@x5)
@text x7 = @double(@x6)
@text x8 = @double(@x7)
@text x9 = @double(@x8)
@text x10 = @double(@x9)
@text x11 = @double(@x10)
@text x12 = @double(@x11)
@text x13 = @double(@x12)
@text x14 = @double(@x13)
@text x15 = @double(@x14)
@text x16 = @double(@x15)
@text x17 = @double(@x16)
@text x18 = @double(@x17)
@text x19 = @double(@x18)
@text x20 = @double(@x19)

@add [[String length: {{x20.length}}]]
```

**Test Points:**
- [ ] Memory limits enforced?
- [ ] Graceful failure?
- [ ] Clear error message?
- [ ] System remains stable?

## Performance Metrics to Collect

For each test:
1. **Execution Time**: How long to complete?
2. **Memory Usage**: Peak memory consumption
3. **CPU Usage**: Average and peak
4. **Output Size**: Size of generated content
5. **Error Handling**: How failures are reported

## Success Criteria

- [ ] No crashes or hangs
- [ ] Clear error messages for limits
- [ ] Reasonable performance degradation
- [ ] Clean process termination
- [ ] No memory leaks
- [ ] System remains responsive

## Cleanup

1. Delete all generated .mld files
2. Remove any output files
3. Clear any temporary data
4. Check for zombie processes
5. Verify memory is released