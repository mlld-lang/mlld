/var @status = "unknown"
/when first [
  @status == "active" => show "Service running"
  @status == "inactive" => show "Service stopped"
  none => show "Unknown status"
]