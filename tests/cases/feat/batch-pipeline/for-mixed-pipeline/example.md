/exe @parse(text) = js {
  return JSON.parse(text);
}
/exe @pluck(obj) = js {
  return obj.value;
}
/exe @unique(text) = js {
  const parsed = JSON.parse(text);
  const normalized = parsed.map(item => {
    const numeric = Number(item);
    return Number.isFinite(numeric) && `${numeric}` === String(item) ? numeric : item;
  });
  return Array.from(new Set(normalized));
}

/var @records = ['{"value": 1}', '{"value": 1}', '{"value": 2}']
/var @result = for @record in @records => @parse(@record) | @pluck => | @unique
/show @result
