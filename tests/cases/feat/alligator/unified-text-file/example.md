# Unified Text File

/var @file = <sample-text.txt>

/exe @jsDefault(f) = js {
  return JSON.stringify({ type: typeof f, value: f });
}

/exe @jsKeep(f) = js {
  return JSON.stringify({
    hasCtx: !!f.ctx,
    filename: f.ctx?.filename,
    dataType: typeof f.data,
    text: f.text,
    type: f.type
  });
}

/show `Type: @file.type`
/show `Text: @file.text.trim()`
/show `Data: @file.data.trim()`
/show @jsDefault(@file)
/show @jsKeep(@file.keep)
/show `Ctx filename: @file.ctx.filename`
