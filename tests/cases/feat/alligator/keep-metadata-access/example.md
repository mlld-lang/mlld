# Keep Metadata Access

/var @file = <keep-note.txt>

/exe @needsMeta(value) = js {
  return JSON.stringify({
    hasCtx: !!value.ctx,
    filename: value.ctx?.filename ?? null,
    type: typeof value
  });
}

/show @needsMeta(@file)
/show @needsMeta(@file.keep)
/show `Filename via ctx: @file.ctx.filename`
