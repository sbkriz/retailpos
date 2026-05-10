# Atomic Design — RetailPOS

> **Use Atomic Design as a guideline, not a strict rule.** Over-splitting components makes codebases harder to navigate. This guide focuses on practical component organization.

---

## Philosophy

**Atomic Design is useful, but many teams over-split with it.**

For RetailPOS, we use a **hybrid approach**:

- **Shared design system** → `components/` (atoms, molecules)
- **Feature-specific UI** → `screens/{feature}/components/`
- **Screens** → Composition and data fetching

**Golden Rule**: Extract components when reused or when screens get hard to read. Keep it inline otherwise.

---

## Component Levels

### Atoms (Generic Reusable UI)

**What**: Single UI elements used across the app.  
**Where**: `components/`  
**Examples**: `Button.tsx`, `Input.tsx`, `Card.tsx`, `StatusBadge.tsx`

```typescript
// ✅ Good: Generic, reusable
<Button title="Save" variant="primary" />

// ❌ Bad: Over-splitting
// components/LoginSubmitButton.tsx (not reusable)
```

**Rules**:

- No business logic, no API calls, no navigation
- Accept props for customization
- Theme-aware styling

---

### Molecules (Reusable Combinations)

**What**: Small groups of atoms functioning together.  
**Where**: `components/` (if reused across features)  
**Examples**: `SearchBar.tsx`, `PinKeypad.tsx`, `ProgressIndicator.tsx`

```typescript
// ✅ Good: Reusable pattern
<SearchBar value={query} onChangeText={setQuery} onClear={() => setQuery('')} />
```

**Rules**:

- Compose 2-5 atoms
- No API calls or navigation
- Simple internal state only (e.g., focus, expanded)

---

### Feature Components (Screen-Specific)

**What**: Components used by a single feature.  
**Where**: `screens/{feature}/components/`  
**Examples**: `BasketSummary.tsx`, `OrderTimeline.tsx`, `StockAdjustmentForm.tsx`

```typescript
// ✅ Good: Feature-specific, lives with feature
// screens/sale/components/BasketSummary.tsx
export const BasketSummary = ({ items, onRemove }) => { ... };
```

**Rules**:

- Can use hooks, context, business logic
- Keep close to the screen that uses them
- Move to `components/` only when reused by 2+ features

---

### Screens (Composition + Data)

**What**: Complete screens that fetch data and compose components.  
**Where**: `screens/`  
**Examples**: `SaleScreen.tsx`, `OrderHistoryScreen.tsx`

```typescript
// ✅ Good: Clean composition
export function SaleScreen() {
  const { products } = useProducts();
  const { basket } = useBasket();

  return (
    <View>
      <SaleHeader />
      <ProductGrid products={products} />
      <BasketPanel items={basket.items} />
    </View>
  );
}
```

**Rules**:

- Fetch data via hooks
- Handle navigation and screen lifecycle
- Minimal styling (delegate to components)

---

## File Structure

```
retailpos/
├── components/                    # Shared design system
│   ├── Button.tsx                # Atom
│   ├── Input.tsx                 # Atom
│   ├── Card.tsx                  # Atom
│   ├── SearchBar.tsx             # Molecule
│   ├── PinKeypad.tsx             # Molecule
│   ├── CheckoutModal.tsx         # Shared across features
│   └── ManagerApprovalModal.tsx  # Shared across features
│
├── screens/                      # Feature-based organization
│   ├── SaleScreen.tsx            # Screen
│   ├── sale/
│   │   ├── components/           # Sale-specific components
│   │   │   ├── BasketSummary.tsx
│   │   │   ├── QuickAddPanel.tsx
│   │   │   └── ProductFilters.tsx
│   │   ├── SaleHeader.tsx        # Layout component
│   │   └── ProductGrid.tsx       # Layout component
│   │
│   ├── OrderHistoryScreen.tsx
│   ├── orders/
│   │   └── components/
│   │       ├── OrderTimeline.tsx
│   │       └── OrderActions.tsx
│   │
│   └── InventoryScreen.tsx
│       └── inventory/
│           └── components/
│               └── StockAdjustmentForm.tsx
│
├── hooks/                        # Custom hooks
├── contexts/                     # Global state
└── services/                     # Business logic
```

---

## When to Extract a Component

**Extract when**:

1. ✅ It's reused in 2+ places
2. ✅ The screen is getting hard to read (>200 lines)
3. ✅ The component has its own clear responsibility
4. ✅ The design should stay consistent across the app

**Keep inline when**:

1. ❌ It's only used once
2. ❌ It's less than 20–30 lines
3. ❌ Extracting would make code harder to follow

```typescript
// ✅ Good: Keep simple JSX inline
export function LoginScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome Back</Text>
      <LoginForm />
    </View>
  );
}

// ❌ Bad: Over-splitting
// components/LoginTitleText.tsx (only used once, 5 lines)
// components/LoginEmailInput.tsx (not reusable)
// components/LoginPasswordInput.tsx (not reusable)
```

---

## Where Does This Component Go?

**Decision flow**:

1. **Is it a basic UI element (button, input)?** → `components/` (atom)
2. **Is it used by 2+ features?** → `components/` (shared)
3. **Is it used by 1 feature?** → `screens/{feature}/components/` (feature-specific)
4. **Is it a complete screen?** → `screens/` (screen)

**Rule of thumb**: Start in feature folder. Move to shared only when actually reused.

---

## Anti-Patterns

### ❌ Over-Splitting

```typescript
// ❌ Bad: Too granular
atoms / LoginEmailInput.tsx; // Not reusable
LoginPasswordInput.tsx; // Not reusable
ProfileUsernameText.tsx; // Not reusable
```

### ❌ Wrong Location

```typescript
// ❌ Bad: Feature-specific in shared
components / BasketSummary.tsx; // Only used in SaleScreen

// ✅ Good: Feature-specific in feature folder
screens / sale / components / BasketSummary.tsx;
```

### ❌ Premature Sharing

```typescript
// ❌ Bad: Moving to shared before reuse
components / OrderTimeline.tsx; // Only used once

// ✅ Good: Keep in feature until actually reused
screens / orders / components / OrderTimeline.tsx;
```

---

## Quick Reference

**Atoms** = Generic reusable UI (Button, Input, Card)  
**Molecules** = Reusable combinations (SearchBar, Keypad)  
**Feature Components** = Screen-specific (BasketSummary, OrderTimeline)  
**Screens** = Data + composition

**Location**:

- Shared (2+ features) → `components/`
- Feature-specific (1 feature) → `screens/{feature}/components/`
- Screens → `screens/`

**Extract when**: Reused, screen too long, clear responsibility  
**Keep inline when**: Used once, <30 lines, simple

---

**Remember**: Use Atomic Design lightly. Don't split components just because you can. Extract when it improves readability or enables reuse.
