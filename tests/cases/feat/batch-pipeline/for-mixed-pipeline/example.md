/exe @parse(text) = js {
  return JSON.parse(text);
}
/exe @pluck(obj) = js {
  return obj.value;
}
/exe @unique(values) = js {
  if (!Array.isArray(values)) {
    throw new Error('expected array input');
  }
  const normalized = values.map(item => {
    const numeric = Number(item);
    return Number.isFinite(numeric) && `${numeric}` === String(item) ? numeric : item;
  });
  return Array.from(new Set(normalized));
}

/var @records = ['{"value": 1}', '{"value": 1}', '{"value": 2}']
/var @result = for @record in @records => @parse(@record) | @pluck => | @unique
/show @result
