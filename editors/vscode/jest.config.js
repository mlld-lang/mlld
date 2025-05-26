module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.ts'],
  moduleNameMapper: {
    '^@mlld/parser$': '<rootDir>/../../grammar/parser/index.ts',
    '^@mlld/types$': '<rootDir>/../../core/types/index.ts'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        moduleResolution: 'node',
        esModuleInterop: true
      }
    }]
  }
};