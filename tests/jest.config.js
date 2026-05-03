/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/..'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  // Exclude integration tests from default test runs
  testPathIgnorePatterns: ['/node_modules/', '/tests/integration/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  globals: {
    // React Native global — not defined in the node test environment
    __DEV__: true,
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/../tsconfig.json',
        diagnostics: false,
      },
    ],
  },
  // Setup file to run before tests
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  // Setup file to run before environment is created
  setupFiles: ['<rootDir>/setupEnv.ts'],
  // Module name mapper for mocking native modules
  moduleNameMapper: {
    '^react-native$': '<rootDir>/__mocks__/react-native.ts',
    '^react-native-logs$': '<rootDir>/__mocks__/react-native-logs.ts',
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.ts',
    '^react-native-http-bridge$': '<rootDir>/__mocks__/react-native-http-bridge.ts',
    '^@env$': '<rootDir>/__mocks__/@env.ts',
    '^uuid$': '<rootDir>/__mocks__/uuid.ts',
  },
  // Transform node_modules that use ES modules
  transformIgnorePatterns: ['node_modules/(?!(react-native|expo-sqlite|react-native-http-bridge|react-native-get-random-values)/)'],
  // Limit workers to reduce OS-level race on worker process teardown
  maxWorkers: '50%',
  // Give workers extra time to exit cleanly before Jest force-kills them
  workerIdleMemoryLimit: '512MB',
};
