# Testing Guidelines — RetailPOS

---

## File Location

Place test files adjacent to their source file:

```
services/basket/
├── BasketService.ts
├── BasketService.test.ts        ← unit test
├── BasketService.integration.test.ts  ← integration test (optional)
utils/
├── money.ts
├── __tests__/
│   └── money.test.ts
```

Tests run with two configs:

- `tests/jest.config.js` — unit tests (`yarn test:unit` / `yarn test`)
- `tests/jest.integration.config.js` — integration tests (`yarn test:integration`)

---

## Required Mocks

Native modules (`expo-sqlite`, `react-native`) are unavailable in Jest. Always mock them in service tests:

```typescript
// Mock uuid (avoids react-native crypto dep)
let counter = 0;
jest.mock('../../utils/uuid', () => ({
  generateUUID: () => `mock-uuid-${++counter}`,
}));

// Mock POSConfigService (avoids expo-sqlite transitive dep)
jest.mock('../../services/config/POSConfigService', () => ({
  DEFAULT_TAX_RATE: () => 0.2,
  MAX_SYNC_RETRIES: () => 3,
  posConfig: {
    values: { taxRate: 0.2, maxSyncRetries: 3, drawerOpenOnCash: true },
    load: jest.fn(),
  },
}));

// Mock AuditLogService (avoids expo-sqlite transitive dep)
jest.mock('../../services/audit/AuditLogService');

// Mock database layer directly (for repository tests)
jest.mock('../../utils/db', () => ({
  db: {
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    runAsync: jest.fn(),
  },
}));
```

---

## Test Structure

```typescript
import { render, fireEvent } from '@testing-library/react-native';
import Button from './Button';

describe('Button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the label', () => {
    const { getByText } = render(<Button title="Pay" />);
    expect(getByText('Pay')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button title="Pay" onPress={onPress} />);
    fireEvent.press(getByText('Pay'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

---

## Service Test Structure

```typescript
describe('BasketService', () => {
  let service: BasketService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BasketService(mockRepository, mockLogger);
  });

  describe('addItem', () => {
    it('creates a new basket when none exists', async () => {
      // arrange
      (mockRepository.findActiveBasket as jest.Mock).mockResolvedValue(null);

      // act
      const basket = await service.addItem({ productId: '1', name: 'Test', price: 9.99, quantity: 1 });

      // assert
      expect(mockRepository.createBasket).toHaveBeenCalled();
      expect(basket.items).toHaveLength(1);
    });
  });
});
```

---

## Running Tests

```bash
yarn test                  # unit tests, no coverage
yarn test:unit             # same
yarn test:integration      # integration tests
yarn test:all              # unit + integration
yarn test:watch            # watch mode (unit)
yarn test:coverage         # unit tests + coverage report

# Single file
npx jest services/basket/BasketService.test.ts

# Single test by name
npx jest -t "creates a new basket"
```

---

## Key Rules

- `jest.clearAllMocks()` in `beforeEach` — never share mock state between tests.
- Mock at the module level (`jest.mock(...)`) for transitive native deps; use `jest.spyOn` for targeted method mocking.
- Do not delete or weaken existing tests without explicit instruction.
- Integration tests may use in-memory SQLite — unit tests must mock the DB layer.
