/var @idsData = '[{"file": 1}, {"file": 2}, {"file": 3}, {"file": 4}]' | @json
/exe @logValue(value, label) = js {
  console.log('[issue-435][logValue]', { label, value });
  return value;
}
/exe @echo(data) = { echo "@data"}
/var @t = :::@entries_json:::
/output @t to "test.att"
/exe @template(entries_json) = template "test.att"
/exe @getIds(entries) = @template(@entries) | @logValue("template-output") | @echo
/var @gi = foreach @getIds(@idsData)
/show @gi
