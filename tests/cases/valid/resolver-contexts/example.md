# Test Resolver Context-Dependent Behavior

## TIME as variable (returns text)
/text @timestamp = @TIME
/add [[Variable TIME: {{timestamp}}]]

## TIME as import (returns data with multiple formats)
/import { iso, unix, date } from @TIME
/add [[Import TIME - ISO: {{iso}}, Date: {{date}}]]