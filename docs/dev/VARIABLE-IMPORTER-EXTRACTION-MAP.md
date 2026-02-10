# VARIABLE IMPORTER EXTRACTION MAP

## Scope

`interpreter/eval/import/VariableImporter.ts` owns import/export variable shaping, metadata propagation, binding collision enforcement, executable rehydration, and policy namespace registration.

## Responsibility Map

1. Export serialization
- `processModuleExports`
- `serializeModuleEnv`
- `serializeShadowEnvs`
- `isLegitimateVariableForExport`

2. Import subtype routing
- `importVariables`
- `handleImportType`
- `handleNamespaceImport`
- `handleSelectedImport`

3. Variable reconstruction and factory routing
- `createVariableFromValue`
- `unwrapArraySnapshots`
- `inferVariableType`
- `createNamespaceVariable`
- `extractMetadataMap`

4. Executable rehydration and captured environment recovery
- `createExecutableFromImport`
- `deserializeModuleEnv`
- `deserializeShadowEnvs`

5. Binding safety and policy/guard side effects
- `ensureImportBindingAvailable`
- `setVariableWithImportBinding`
- `resolveImportedPolicyConfig`
- policy registration flow inside `handleNamespaceImport`

## Extraction Seams

1. `variable-importer/serialization`
- Export snapshot serialization and metadata envelope writing.

2. `variable-importer/routing`
- Import subtype dispatch and selected/namespace branch handling.

3. `variable-importer/factory`
- Value-type reconstruction and namespace variable creation.

4. `variable-importer/executable`
- Executable import payload rehydration and captured env restoration.

5. `variable-importer/binding-policy`
- Import binding collision handling and policy namespace side effects.

## Regression Hazards

1. Captured module env reconstruction
- `capturedModuleEnv` map shape drives executable sibling lookups.
- Circular serialization prevention relies on identity and weak-set tracking.

2. Shadow environment deserialization
- Shadow env maps require function identity preservation for executable invocation.

3. Metadata/security propagation
- `__metadata__` extraction and `VariableMetadataUtils` application control labels/taint flow.

4. Binding collision payloads
- `IMPORT_NAME_CONFLICT` details include source/location fields used in diagnostics.

5. Namespace policy side effects
- `importPolicy` records policy config and generates policy guards from namespace contents.

6. Optional dynamic imports
- `@payload` and `@state` selected imports allow missing fields and synthesize `null` variables.
