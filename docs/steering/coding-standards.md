# Coding Standards — RetailPOS

> Canonical rules for TypeScript, naming, file structure, and common task patterns. Follow these exactly — do not deviate without updating this document.

---

## TypeScript

- **Always use TypeScript.** No `.js` files in the codebase.
- **No `any` type.** Use `unknown` or proper typing.
- **Explicit interfaces** for all data structures — export them for reuse.
- **Prefer `import type`** for type-only imports to avoid circular dependencies.
- **Explicit return types** on all public service/repository methods.

```typescript
// ✅
export interface User {
  id: string;
  name: string;
  role: UserRole;
}
export type UserRole = 'admin' | 'manager' | 'cashier';

// ❌
const user: any = { ... };
```

---

## Naming Conventions

| Item                | Convention                   | Example                     |
| ------------------- | ---------------------------- | --------------------------- |
| Component files     | PascalCase `.tsx`            | `ProductCard.tsx`           |
| Screen files        | PascalCase + `Screen` suffix | `OrderScreen.tsx`           |
| Hook files          | camelCase with `use` prefix  | `useProducts.ts`            |
| Service files       | PascalCase                   | `BasketService.ts`          |
| Interface files     | PascalCase + `Interface`     | `BasketServiceInterface.ts` |
| Factory files       | PascalCase + `Factory`       | `ProductServiceFactory.ts`  |
| Repository files    | PascalCase + `Repository`    | `OrderRepository.ts`        |
| Data / type files   | camelCase                    | `basket.ts`, `types.ts`     |
| Context files       | PascalCase + `Provider`      | `BasketProvider.tsx`        |
| Mock files          | PascalCase + `Mock`          | `StripeMockService.ts`      |
| Constants           | SCREAMING_SNAKE_CASE         | `DEFAULT_PAGE_SIZE`         |
| Functions / methods | camelCase                    | `fetchProducts`             |
| React components    | PascalCase                   | `ProductCard`               |

### Interface naming rule

**Never prefix interfaces with `I`** (e.g. not `IOrderRepository`). The interface takes the plain noun (`OrderRepository`); the SQLite class is `OfflineOrderRepository`; the HTTP class is `LocalApiOrderRepository`.

---

## File Organisation (within a file)

```typescript
// 1. External imports first, then internal
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useProducts } from '../hooks/useProducts';
import { lightColors, spacing } from '../utils/theme';

// 2. Types and interfaces
interface ProductCardProps {
  product: UnifiedProduct;
  onPress: (id: string) => void;
}

// 3. Component / function definition
const ProductCard: React.FC<ProductCardProps> = ({ product, onPress }) => {
  // Hooks first
  const [isLoading, setIsLoading] = useState(false);

  // Callbacks
  const handlePress = useCallback(() => { onPress(product.id); }, [product.id, onPress]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{product.name}</Text>
    </View>
  );
};

// 4. Styles
const styles = StyleSheet.create({
  container: { padding: spacing.md },
});

// 5. Export
export default ProductCard;
```

---

## Normalisation Rules

- **Hooks** — always `export const useX = ()`, never `export default`. State flag uses `isLoading` (not `loading`).
- **Error handling in hooks** — use `useLogger('hookName')` + `logger.error(...)`, never `console.error`.
- **Contexts** — named exports only: `export const XProvider` + `export const useX`.
- **Components** — `export default ComponentName` is fine.
- **No barrel / index files** — do not create `index.ts` solely to re-export sibling files. Import source files directly.
- **Imports always at top** — never import inside function bodies.

---

## The 14 Non-Negotiable Rules

1. **Never hardcode API keys** — use environment variables or `SecretsService`.
2. **Always handle errors** — wrap async operations in try/catch; never swallow errors silently.
3. **No `any` types** — `unknown` or precise types only.
4. **Follow existing patterns** — check a similar file before creating a new one.
5. **Single responsibility** — keep components and services focused on one concern.
6. **Memoize expensive operations** — use `useMemo` and `useCallback` in hooks and providers.
7. **Clean up effects** — always return a cleanup function from `useEffect` when subscribing.
8. **Use theme constants** — never hardcode colours, spacing, or typography values (see `docs/steering/ux-standards.md`).
9. **No index re-export files** — import files directly to avoid indirection and circular deps.
10. **No hardcoded config** — use `posConfig.values` for tax rate, store info, currency, etc.
11. **Logger over console** — use `LoggerInterface` (via constructor injection or `LoggerFactory`) everywhere. `console.log/error/warn` is prohibited in services and contexts.
12. **Drawer is UI-driven** — `CheckoutService` sets `openDrawer` on `CheckoutResult`; the UI reads the flag and calls the drawer service. Services never open hardware directly.
13. **Role access defaults to least privilege** — `canAccessTab` and `canAccessMoreMenuItem` default to `'cashier'` when role is `undefined`. Never default to full access.
14. **Known security gap — PIN plaintext** — User PINs are currently stored as plaintext in `users.pin`. Before production, hash with bcrypt/Argon2 in `UserRepository` and compare hashes in `PinAuthProvider`.

---

## Money Arithmetic

**All monetary math MUST use `utils/money.ts`** — never raw float arithmetic (ADR-006).

```typescript
import { multiplyMoney, addMoney, sumMoney, calculateTax, roundMoney, formatMoney } from '../utils/money';

// ✅
const lineTotal = multiplyMoney(9.99, 3); // 29.97
const tax = calculateTax(29.97, 0.2); // 5.99
const display = formatMoney(29.97); // "$29.97"

// ❌ Never
const bad = 9.99 * 3; // 29.970000000000002
```

| Function                                        | Description                        |
| ----------------------------------------------- | ---------------------------------- |
| `multiplyMoney(price, qty)`                     | Price × quantity → dollars         |
| `addMoney(a, b)`                                | Add two dollar amounts             |
| `subtractMoney(a, b)`                           | Subtract dollar amounts            |
| `sumMoney(amounts[])`                           | Sum an array                       |
| `calculateTax(amount, rate)`                    | Tax at decimal rate (0.2 = 20%)    |
| `calculateLineTotal(price, qty, taxable, rate)` | Returns `{ lineTotal, taxAmount }` |
| `roundMoney(amount)`                            | Round to 2 decimal places          |
| `formatMoney(amount, symbol?)`                  | Display string e.g. `"$19.99"`     |

---

## Common Tasks

### Add a new service domain

1. Create `services/[domain]/[Domain]ServiceInterface.ts` — the contract.
2. Create `services/[domain]/[domain]ServiceFactory.ts` — singleton factory.
3. Create `services/[domain]/platforms/Base[Domain]Service.ts` — shared base.
4. Add one class per platform in `services/[domain]/platforms/`.
5. Create `hooks/use[Domain].ts` — hook layer for UI.

### Add a new screen

1. Create `screens/[Name]Screen.tsx`.
2. Add to the relevant navigator in `navigation/`.
3. Add the param type to `navigation/types.ts`.

### Add a new settings tab

1. Create `screens/settings/[Feature]SettingsTab.tsx`.
2. Import and register in `screens/SettingsScreen.tsx`.

### Add a new repository

1. Create `repositories/[Entity]Repository.ts`.
2. Export an **interface** `[Entity]Repository` — the contract.
3. Export a class `Offline[Entity]Repository implements [Entity]Repository` — SQLite implementation.
4. Export a singleton `export const [entity]Repository = new Offline[Entity]Repository()`.
5. Export a factory `export function get[Entity]Repository(): [Entity]Repository` — checks `localApiConfig.isClient`, returns `LocalApi[Entity]Repository` or the offline singleton.
6. If multi-register needed: create `repositories/LocalApi[Entity]Repository.ts` implementing the same interface via `localApiClient`.

### Add a new platform

1. Create one implementation class per domain in `services/[domain]/platforms/NewPlatform[Domain]Service.ts`.
2. Register each in its factory's `switch` block.
3. Add the enum value to `ECommercePlatform` in `utils/platforms.ts`.
4. Add capability profile to `PLATFORM_CAPABILITY_MATRIX` in `utils/platformCapabilities.ts`.
