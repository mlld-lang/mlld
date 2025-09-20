# In @company/ai-tools.mld
/export { smartExtract, validate }
/exe @smartExtract(doc) = js { /* 100 lines of parsing */ }
/exe @validate(data) = js { /* schema validation */ }

# In your script
/import { smartExtract } from @company/ai-tools
/var @data = <report.pdf> | @smartExtract