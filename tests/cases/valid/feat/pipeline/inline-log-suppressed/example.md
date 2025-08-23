# Pipeline Inline Log (Suppressed from Document)

/exe @gen() = js { return "x"; }

/var @out = @gen() with { pipeline: [ log "This is hidden", show "visible" ] }
