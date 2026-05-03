# Integration Tests

This directory contains integration tests that test multiple components working together, including infrastructure like HTTP servers, databases, and external services.

## Difference from Unit Tests

**Unit Tests** (`**/*.test.ts`):

- Test individual functions/classes in isolation
- Mock all dependencies
- Fast execution
- No infrastructure (no database, no servers, no network)
- Run by default with `npm test`

**Integration Tests** (`tests/integration/**/*.integration.test.ts`):

- Test multiple components working together
- May use real infrastructure (mocked at a higher level)
- Slower execution
- Test actual behavior of integrated systems
- Run explicitly with `npm run test:integration`

## Running Integration Tests

```bash
# Run only integration tests
npm run test:integration

# Run only unit tests (default)
npm test
# or
npm run test:unit

# Run all tests (unit + integration)
npm run test:all
```

## Current Integration Tests

### InstoreApiTransport.integration.test.ts

Tests the HTTP transport layer for multi-register functionality:

- HTTP server lifecycle (start/stop)
- Request handling and routing
- Authentication
- JSON parsing
- Query parameter handling

This is an integration test because it:

- Starts an actual HTTP server (mocked at the bridge level)
- Tests the full request/response cycle
- Involves multiple components (transport, server, config)
- Tests infrastructure behavior, not just business logic

## Adding New Integration Tests

1. Create test file in `tests/integration/` with `.integration.test.ts` suffix
2. Import and test multiple components together
3. Use real infrastructure where appropriate (with mocks at boundaries)
4. Document what's being integrated and why it's not a unit test

## Best Practices

- Keep integration tests focused on specific integration scenarios
- Don't duplicate unit test coverage
- Use integration tests to verify components work together correctly
- Mock external services (APIs, databases) at the boundary
- Clean up resources (servers, connections) in `afterEach` hooks
