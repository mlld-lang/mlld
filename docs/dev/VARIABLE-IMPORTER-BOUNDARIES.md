# VARIABLE IMPORTER BOUNDARIES

## SERIALIZATION BOUNDARY
- `VariableImporter.processModuleExports` owns export orchestration.
- `ModuleExportManifestValidator` resolves explicit export plans.
- `ModuleExportSerializer` serializes exportable variables and metadata.
- `GuardExportChecker` validates guard exports and serializes guard definitions.
- `VariableImportUtilities.isLegitimateVariableForExport` gates export eligibility.
- `CapturedEnvRehydrator` and `ExecutableImportRehydrator` restore captured module/shadow environments during import reconstruction.

## IMPORT ROUTING BOUNDARY
- `VariableImporter.importVariables` parses serialized metadata and delegates by subtype.
- `ImportTypeRouter` routes `importNamespace`, `importSelected`, and `importPolicy`.
- `NamespaceSelectedImportHandler` owns namespace/selected assignment behavior and binding rules.
- `PolicyImportHandler` owns policy config selection, policy recording, and generated policy guard registration.

## FACTORY AND VALUE BOUNDARY
- `ImportVariableFactoryOrchestrator` routes value reconstruction by import value shape.
- Factory strategies under `variable-importer/factory/*` own template/executable/array/object/primitive reconstruction behavior.
- `VariableImportUtilities` owns snapshot unwrapping, namespace variable shaping, complexity inference, and import display-path normalization.

## DEPENDENCY DIRECTION
- `VariableImporter` depends on extracted modules.
- Extracted modules do not depend on `VariableImporter`.
- Cross-module callbacks remain explicit and directional:
  - executable reconstruction callback: utilities -> importer -> executable rehydrator
  - variable reconstruction callback: executable rehydrator -> importer -> factory orchestrator
