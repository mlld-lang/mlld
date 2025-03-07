# Resetting the Failed DI-Only Mode Changes

We attempted to force DI-only mode by modifying core files, which broke nearly all tests. Here's how to reset those changes:

## Files to Reset

The following files were modified in the unsuccessful attempt:

1. `core/ServiceProvider.ts` - Changed `shouldUseDI()` to always return true
2. `core/ServiceProvider.test.ts` - Updated tests for the new behavior
3. `services/state/StateService/StateService.ts` - Simplified constructor but broke initialization
4. `services/fs/FileSystemService/PathOperationsService.ts` - Added path normalization utilities
5. `tests/utils/TestSnapshot.ts` - Updated to use new path normalization
6. `tests/utils/di/TestContainerHelper.ts` - Removed conditional DI checks
7. `tests/utils/di/TestContainerHelper.test.ts` - Updated tests
8. `tests/utils/di/TestContextDI.ts` - Modified to always use DI mode

## Reset Command

To reset all these changes at once:

```bash
git checkout -- \
  core/ServiceProvider.ts \
  core/ServiceProvider.test.ts \
  services/state/StateService/StateService.ts \
  services/fs/FileSystemService/PathOperationsService.ts \
  tests/utils/TestSnapshot.ts \
  tests/utils/di/TestContainerHelper.ts \
  tests/utils/di/TestContainerHelper.test.ts \
  tests/utils/di/TestContextDI.ts
```

## Add Documentation Files

The planning documents we created should be kept and committed:

```bash
git add _dev/issues/features/tsyringe.md
git add _dev/issues/features/tsyringe-cleanup-approach.md
git add _dev/issues/features/tsyringe-cleanup-revised.md
git add _dev/issues/features/tsyringe-first-task.md
git add _dev/issues/features/constructor-simplification.md
```

## Verify Reset

After resetting the files, verify that tests now pass:

```bash
npm test core/ServiceProvider.test.ts tests/utils/di/TestContainerHelper.test.ts
```

If these tests pass, run a broader test suite to ensure everything is working:

```bash
npm test
```

## Next Steps

After resetting, proceed with the methodical approach outlined in `tsyringe.md`:

1. Start with the path normalization task
2. Make small, incremental changes
3. Test after each change
4. Keep `tsyringe.md` updated with progress