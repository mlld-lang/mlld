# Keep Metadata Access

/var @file = <keep-note.txt>

/exe @needsMeta(value) = js {
  return JSON.stringify({
    hasCtx: !!value.mx,
    filename: value.mx?.filename ?? null,
    type: typeof value
  });
}

/show @needsMeta(@file)
/show @needsMeta(@file.keep)
/show `Filename via mx: @file.mx.filename`
