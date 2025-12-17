# Unified JSON File

/var @file = <sample.json>

/exe @jsDefault(f) = js {
  return JSON.stringify({ type: typeof f, name: f.name, hasFilename: 'filename' in f });
}

/exe @jsKeep(f) = js {
  return JSON.stringify({
    type: typeof f,
    hasCtx: !!f.mx,
    filename: f.mx?.filename,
    data: f.data
  });
}

/show `Type: @file.type`
/show `Data name: @file.data.name`
/show `Text: @file.text.trim()`
/show @jsDefault(@file)
/show @jsKeep(@file.keep)
/show `Ctx filename: @file.mx.filename`
