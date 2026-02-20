# Audit log taint propagation

/var secret @token = "sk-123"
/output @token to "audit-log-taint.txt"

/var @loaded = <audit-log-taint.txt>
/show `Labels: @loaded.mx.labels`

/var @audit = <@base/.mlld/sec/audit.jsonl>
/exe @findWrite(events) = js {
  return events.find(event => event.event === "write" && event.path.endsWith("audit-log-taint.txt"));
}
/var @writeEvent = @findWrite(@audit)
/show `Audit: @writeEvent.event`
