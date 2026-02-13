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

/show `Type: @file.mx.type`
/show `Data name: @file.name`
/show `Text: @file.mx.text`
/show @jsDefault(@file)
/show @jsKeep(@file.keep)
/show `Ctx filename: @file.mx.filename`
