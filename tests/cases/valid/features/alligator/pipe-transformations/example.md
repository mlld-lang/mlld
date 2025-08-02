# Test AlligatorExpression with Pipe Transformations

Test pipe support on AlligatorExpression for applying transformations to loaded content.

/exe @upper(text) = js { return text.toUpperCase(); }
/exe @first(text, n) = js { 
  const lines = text.split('\n');
  return lines.slice(0, parseInt(n) || 1).join('\n');
}

## Single pipe transformation
/var @uppercased = <sample.txt>|@upper
/show @uppercased

## Multiple pipe transformations
/var @processed = <sample.txt>|@upper|@first(2)
/show @processed

## Pipes in show directive
/show <sample.txt>|@first(1)|@upper