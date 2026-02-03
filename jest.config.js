module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/index.ts', // Exclude entry point from coverage
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  modulePathIgnorePatterns: ['<rootDir>/workspace/'],
  testPathIgnorePatterns: ['<rootDir>/workspace/'],
  // Transform ESM modules from @octokit and @anthropic-ai packages
  transformIgnorePatterns: ['node_modules/(?!(@octokit|@anthropic-ai)/)'],
  moduleNameMapper: {
    '@anthropic-ai/claude-agent-sdk': '<rootDir>/test/__mocks__/claude-agent-sdk.ts',
  },
};
