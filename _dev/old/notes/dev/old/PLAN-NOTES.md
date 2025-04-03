# Test Integration Notes

## Key Changes

1. Transformation Mode Integration
   - Moved transformation enabling from `ProcessOptions` to `StateService`
   - Tests now enable transformation via `context.services.state.enableTransformation(true)`
   - Removed invalid `options` property from main function calls

2. Test Structure
   - Tests verify both transformed and untransformed states
   - Transformation tests check directive replacement and content preservation
   - Run directive tests verify placeholder text in normal mode and actual output in transformation mode

## Verification Points

- Definition directives are omitted from output
- Text content is preserved across transformations
- Run directives show placeholders in normal mode
- Run directives show actual output in transformation mode
- State variables are properly maintained 