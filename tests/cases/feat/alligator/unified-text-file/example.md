# Unified Text File

/var @file = <sample-text.txt>

/exe @jsDefault(f) = js {
  return JSON.stringify({ type: typeof f, value: f });
}

/exe @jsKeep(f) = js {
  return JSON.stringify({
    hasCtx: !!f.mx,
    filename: f.mx?.filename,
    dataType: typeof f.data,
    text: f.text,
    type: f.type
  });
}

/exe @chomp(value) = js {
  return value.trim();
}

/show `Type: @file.mx.type`
/show `Text: @chomp(@file.mx.text)`
/show `Data: @chomp(@file.mx.data)`
/show @jsDefault(@file)
/show @jsKeep(@file.keep)
/show `Ctx filename: @file.mx.filename`
