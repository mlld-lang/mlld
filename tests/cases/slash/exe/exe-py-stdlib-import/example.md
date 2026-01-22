# Python Standard Library Import Test

Tests importing and using Python standard library modules.

## Test json module

/exe @parseJson(jsonStr) = py {
import json
data = json.loads(jsonStr)
print(data.get('name', 'unknown'))
}

/var @jsonData = `{"name": "Alice", "age": 30}`
/var @name = @parseJson(@jsonData)
/show `Parsed name: @name`

## Test math module

/exe @calculateSqrt(x) = py {
import math
print(math.sqrt(float(x)))
}

/var @sqrtResult = @calculateSqrt(16)
/show `Square root of 16: @sqrtResult`

## Test datetime module

/exe @getCurrentYear() = py {
from datetime import datetime
print(datetime.now().year)
}

/var @year = @getCurrentYear()
/show `Current year: @year`

## Test os.path module

/exe @getBasename(path) = py {
import os.path
print(os.path.basename(path))
}

/var @basename = @getBasename("/usr/local/bin/python")
/show `Basename: @basename`

## Test re module (regex)

/exe @extractNumbers(text) = py {
import re
numbers = re.findall(r'\d+', text)
print(','.join(numbers))
}

/var @numbers = @extractNumbers("I have 3 apples and 42 oranges")
/show `Numbers found: @numbers`

## Test collections module

/exe @countWords(text) = py {
from collections import Counter
words = text.lower().split()
counts = Counter(words)
most_common = counts.most_common(1)[0]
print(f"{most_common[0]}:{most_common[1]}")
}

/var @wordCount = @countWords("apple banana apple cherry apple banana")
/show `Most common: @wordCount`
