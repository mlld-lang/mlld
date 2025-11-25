/exe @suffix(value) = js { return `${value}-done`; }
/var @secret = "  PipelineValue  "
/var @result = @secret.trim().slice(0,8) with { pipeline: [@suffix] }
/show @result
