export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^meld-spec$': '<rootDir>/node_modules/meld-spec/dist/esm/index.js'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        allowJs: true,
        esModuleInterop: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext'
      }
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(meld-spec|meld-ast)/)'
  ]
}; 