# Test Resolver Context-Dependent Behavior

## TIME as variable (returns text)
/var @timestamp = @TIME
/show ::Variable TIME: {{timestamp}}::

## TIME as import (returns data with multiple formats)
/import { iso, unix, date } from @TIME
/show ::Import TIME - ISO: {{iso}}, Date: {{date}}::