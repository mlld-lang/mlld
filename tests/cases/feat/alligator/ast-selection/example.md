# AST Selection Integration

Verify AST braces across TypeScript, Python, glob metadata, and template transforms.

/exe @namesOnly(json) = js {
  const data = JSON.parse(json);
  return data.map(item => item ? item.name : 'null').join(', ');
}

/exe @typesOnly(json) = js {
  const data = JSON.parse(json);
  return data.map(item => item ? `${item.name} (${item.type})` : 'null').join(', ');
}

/exe @fileSummary(json) = js {
  const data = JSON.parse(json);
  return data.map(item => {
    if (!item) return 'null';
    const file = item.file ? item.file.split('/').pop() : 'none';
    return `${file}:${item.name}`;
  }).join('\n');
}

## TypeScript definitions and usage
/var @tsNames = <src/service.ts { createUser, (helper) }>|@json|@namesOnly
/show @tsNames

## Interface and enum coverage
/var @typeSummary = <src/model.ts { User, UserId, Role }>|@json|@typesOnly
/show @typeSummary

## Python null placeholder
/var @pySummary = <python/service.py { create_user, missing_fn }>|@json|@namesOnly
/show @pySummary

## Glob summary with pipeline
/var @globSummary = <src/*.ts { createUser, User }>|@json|@fileSummary
/show @globSummary
