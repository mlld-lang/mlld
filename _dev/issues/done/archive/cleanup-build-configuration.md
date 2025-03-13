# Update Build Configuration After DI Migration

## Background
The TSyringe dependency injection migration introduced changes to the project's build configuration, particularly in how dependencies are managed and bundled. Some of these changes may have unintended consequences for the build output and runtime behavior.

## Problem
The following issues have been identified in the build configuration:
1. **Node Platform Configuration:** The Node.js platform setting (`options.platform = 'node'`) was removed from some build configurations, which could cause issues with Node.js-specific code.
2. **Dependency Management:** Several Node.js built-in modules were removed from the external dependencies list but may still be used in the codebase.
3. **TSyringe Bundling:** TSyringe and related reflection metadata dependencies need special handling in the build configuration.
4. **ESM/CJS Compatibility:** The migration may have affected the dual ESM/CJS module output compatibility.
5. **Tree Shaking:** The DI registration pattern could impact the effectiveness of tree shaking in the build.

## Proposed Solution
1. Restore the Node.js platform configuration in all build targets
2. Audit and update the external dependencies list to match actual usage
3. Configure proper handling of TSyringe and reflect-metadata in the build
4. Ensure ESM and CJS outputs remain compatible with their respective ecosystems
5. Optimize tree shaking for DI-based code

## Implementation Steps
1. Review and restore the `options.platform = 'node'` setting in all build targets
2. Conduct a dependency audit to identify all required external modules
3. Update the `external` and `noExternal` lists in the build configuration
4. Configure proper handling of reflection metadata for TSyringe
5. Test both ESM and CJS outputs with sample client code
6. Measure bundle size before and after optimizations
7. Document the build configuration changes for future reference

## Success Criteria
- All builds correctly specify the Node.js platform where appropriate
- External dependencies are properly declared
- TSyringe and reflection metadata are properly handled
- Both ESM and CJS outputs work correctly
- Bundle size is optimized with effective tree shaking
- No runtime errors related to missing or incorrectly bundled dependencies

## Estimated Complexity
Low - Requires targeted changes to build configuration files 