# Test Directory Structure

This directory contains all test-related files for the retail POS application.

## Directory Structure

```
tests/
├── __mocks__/              # Mock implementations for native modules
│   ├── @env.ts            # Environment variables mock
│   ├── expo-sqlite.ts     # SQLite database mock
│   ├── react-native.ts    # React Native core modules mock
│   ├── react-native-logs.ts # Logger mock (prevents async warnings)
│   ├── react-native-http-bridge.ts # HTTP bridge mock
│   └── uuid.ts            # UUID generation mock
├── integration/           # Integration tests
│   ├── README.md         # Integration test documentation
│   └── *.integration.test.ts # Integration test files
├── jest.config.js        # Jest configuration for unit tests
├── jest.integration.config.js # Jest configuration for integration tests
├── setup.ts              # Test environment setup (runs after env)
├── setupEnv.ts           # Early environment setup (runs first)
└── README.md             # This file
```

## Test Types

### Unit Tests

- **Location**: `**/*.test.ts` (anywhere in the project, except `tests/integration/`)
- **Purpose**: Test individual functions/classes in isolation
- **Characteristics**:
  - Fast execution (~3-4s for 275 tests)
  - Mock all dependencies
  - No infrastructure (no database, no servers)
  - Run by default with `npm test`

### Integration Tests

- **Location**: `tests/integration/**/*.integration.test.ts`
- **Purpose**: Test multiple components working together
- **Characteristics**:
  - Slower execution (~2-3s for 12 tests)
  - Test actual behavior of integrated systems
  - May use real infrastructure (mocked at boundaries)
  - Run explicitly with `npm run test:integration`

## Running Tests

```bash
# Run unit tests only (default, fast)
npm test
# or
npm run test:unit

# Run integration tests only
npm run test:integration

# Run all tests (unit + integration)
npm run test:all

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Configuration Files

### jest.config.js

Main Jest configuration for unit tests:

- Excludes `tests/integration/` directory
- Configures mocks for native modules
- Sets up test environment
- Skips database initialization in tests

### jest.integration.config.js

Jest configuration for integration tests:

- Only runs tests in `tests/integration/`
- Uses same mocks as unit tests
- Allows infrastructure testing

### setup.ts

Runs after the test environment is created:

- Suppresses async logging warnings
- Configures test-specific behavior

### setupEnv.ts

Runs before any modules are loaded:

- Sets `NODE_ENV=test`
- Prevents database schema initialization
- Ensures proper test isolation

## Mock Files

### Why We Mock Native Modules

React Native modules can't run in Node.js test environment. We mock them to:

1. Enable tests to run without native dependencies
2. Provide deterministic behavior
3. Speed up test execution
4. Prevent side effects

### Mock Implementations

- **expo-sqlite**: Provides in-memory database mock with transaction support
- **react-native**: Mocks Platform, Dimensions, StyleSheet, and components
- **react-native-logs**: Synchronous no-op logger to prevent async warnings
- **react-native-http-bridge**: Mocks HTTP server for API testing
- **@env**: Provides test environment variables
- **uuid**: Deterministic UUID generation for tests

## Best Practices

### Writing Unit Tests

1. Test one thing at a time
2. Mock all external dependencies
3. Use descriptive test names
4. Keep tests fast and isolated
5. Don't test implementation details

### Writing Integration Tests

1. Test realistic scenarios
2. Mock at system boundaries (APIs, databases)
3. Clean up resources in `afterEach`
4. Document what's being integrated
5. Keep focused on integration points

### Test Organization

- Place unit tests next to the code they test
- Use `.test.ts` suffix for unit tests
- Use `.integration.test.ts` suffix for integration tests
- Group related tests in `describe` blocks

## Troubleshooting

### Tests are slow

- Check if you're running integration tests by mistake
- Use `npm run test:unit` for faster feedback
- Consider using `test:watch` for development

### "Cannot log after tests are done" warnings

- Should not appear (we mock the logger)
- If they do, check that `react-native-logs` mock is working
- Verify Jest config includes the mock in `moduleNameMapper`

### Database initialization in tests

- Should not happen (we check `NODE_ENV=test`)
- If it does, verify `setupEnv.ts` is running first
- Check that `utils/db.ts` has the NODE_ENV check

### Import errors for native modules

- Verify the module is mocked in `__mocks__/`
- Check `moduleNameMapper` in Jest config
- Ensure mock file exports match the real module

## Adding New Tests

### Adding a Unit Test

1. Create `*.test.ts` file next to the code
2. Import the code to test
3. Mock dependencies using Jest
4. Write test cases
5. Run with `npm test`

### Adding an Integration Test

1. Create `*.integration.test.ts` in `tests/integration/`
2. Import multiple components to test together
3. Mock at system boundaries
4. Write integration scenarios
5. Run with `npm run test:integration`

### Adding a New Mock

1. Create mock file in `tests/__mocks__/`
2. Export same interface as real module
3. Add to `moduleNameMapper` in both Jest configs
4. Document the mock's purpose

## Test Results

Current test coverage:

- **Unit tests**: 25 suites, 275 tests ✅
- **Integration tests**: 1 suite, 12 tests ✅
- **Total**: 287 tests, all passing
- **Execution time**: ~5-6s total
- **Warnings**: 0 (clean output)
