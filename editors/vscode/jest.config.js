module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.ts'],
  moduleNameMapper: {
    '^@meld/parser$': '<rootDir>/../../grammar/parser/index.ts',
    '^@meld/types$': '<rootDir>/../../core/types/index.ts'
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