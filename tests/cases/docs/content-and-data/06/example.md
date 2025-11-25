/exe @process(f) = js { return f.ctx.filename; }
/show @process(@file.keep)  # Works - wrapper has .ctx
/show @process(@file)        # Error - unwrapped to string/object