# UX & UI Standards — RetailPOS

> Canonical rules for visual design, component structure, and screen layout. All UI work must follow these standards. Never hardcode colours, spacing, or typography.

---

## Theme System

All visual tokens come from `utils/theme.ts`. Import only what you need.

```typescript
import { lightColors, spacing, typography, borderRadius, elevation } from '../utils/theme';

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    backgroundColor: lightColors.surface,
    borderRadius: borderRadius.lg,
    ...elevation.low,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: lightColors.textPrimary,
  },
});
```

---

## Theme Constants Reference

### Spacing

| Token        | Value |
| ------------ | ----- |
| `spacing.xs` | 4     |
| `spacing.sm` | 8     |
| `spacing.md` | 16    |
| `spacing.lg` | 24    |
| `spacing.xl` | 32    |

### Colours

| Token                       | Use                           |
| --------------------------- | ----------------------------- |
| `lightColors.primary`       | Primary brand / action colour |
| `lightColors.secondary`     | Secondary action              |
| `lightColors.success`       | Confirmation, paid status     |
| `lightColors.warning`       | Caution, pending status       |
| `lightColors.error`         | Error, failed status          |
| `lightColors.surface`       | Card / panel background       |
| `lightColors.background`    | Screen background             |
| `lightColors.textPrimary`   | Body text                     |
| `lightColors.textSecondary` | Secondary / helper text       |
| `lightColors.border`        | Input and card borders        |
| `lightColors.divider`       | Horizontal rule / separator   |

### Typography

| Token                    | px  |
| ------------------------ | --- |
| `typography.fontSize.xs` | 12  |
| `typography.fontSize.sm` | 14  |
| `typography.fontSize.md` | 16  |
| `typography.fontSize.lg` | 18  |
| `typography.fontSize.xl` | 20  |

### Border Radius

| Token                | px   |
| -------------------- | ---- |
| `borderRadius.sm`    | 4    |
| `borderRadius.md`    | 8    |
| `borderRadius.lg`    | 12   |
| `borderRadius.round` | 9999 |

---

## Component Structure

### Reusable components (`components/`)

Export named from `components/index.ts` only if the component is truly shared across multiple screens. Otherwise import the source file directly.

```typescript
// components/index.ts
export { Button, type ButtonVariant } from './Button';
export { Input, type InputSize } from './Input';
```

### Screen components (`screens/`)

```typescript
// screens/[Name]Screen.tsx
import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import type { StackScreenProps } from '../navigation/types';

interface NameScreenProps extends StackScreenProps<'Name'> {}

const NameScreen: React.FC<NameScreenProps> = ({ navigation }) => {
  // 1. Hooks
  // 2. Handlers / callbacks
  // 3. Render helpers
  // 4. Return JSX

  return (
    <View style={styles.container}>
      {/* content */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
});

export default NameScreen;
```

### Settings tab components (`screens/settings/`)

```typescript
// screens/settings/[Feature]SettingsTab.tsx
const FeatureSettingsTab: React.FC = () => {
  const { settings, updateSettings, isLoading } = useFeatureSettings();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Section Title</Text>
        {/* controls */}
      </View>
    </ScrollView>
  );
};

export default FeatureSettingsTab;
```

---

## Accessibility

Every interactive element must include:

- `accessibilityLabel` — describes what the element is (noun phrase)
- `accessibilityRole` — e.g. `'button'`, `'text'`, `'radio'`
- `accessibilityHint` — describes what happens on activation (optional if self-evident)
- `accessibilityState` — `{ disabled, checked, selected }` where applicable

```typescript
<TouchableOpacity
  accessibilityLabel="Add to cart"
  accessibilityRole="button"
  accessibilityHint="Adds this product to your current order"
  onPress={handleAdd}
/>
```

Dynamic labels must reflect state:

```typescript
accessibilityLabel={`Notifications, ${unreadCount} unread`}
```

Badge views that duplicate visible text should be hidden from accessibility:

```typescript
<View accessible={false} importantForAccessibility="no-hide-descendants">
  <Text>{unreadCount}</Text>
</View>
```

---

## Responsive Layout

Use `useResponsive()` for layout branching:

- **Mobile** — swipeable basket panel; single-column product grid; `Alert` dialogs for critical actions
- **Tablet** — inline basket sidebar (`BasketContent`); two/three-column product grid
- **Desktop (Electron)** — full sidebar; keyboard-driven interactions; IPC-based peripherals

UI components never hard-switch on platform — always branch on the responsive hook's values.

---

## Scan Result Feedback

Barcode scan outcomes are shown as **inline coloured banners** (`scanResult` state), never as blocking `Alert` dialogs:

| State           | Banner colour |
| --------------- | ------------- |
| `searching`     | Blue          |
| `found_local`   | Green         |
| `found_variant` | Green         |
| `found_online`  | Green         |
| `not_found`     | Red           |

---

## Toast Notifications

Use `NotificationService` for non-blocking feedback. Toasts auto-dismiss. Never use `Alert` for informational messages that do not require a user decision.

---

## Internationalisation

All user-visible strings must use `i18next` translation keys. Never hardcode English strings in JSX.

```typescript
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
// ...
<Text>{t('basket.emptyMessage')}</Text>
```

Translation files live in `locales/en.json`, `locales/es.json`, `locales/fr.json`, `locales/de.json`.

---

## Sales Screen UX Patterns

### Persistent Status Header

All sales screens must display a persistent status header showing current context:

```typescript
<SalesStatusHeader
  registerName="Register 2"
  cashierName="Alban"
  saleMode="counter"
  orderState={saleState}
  orderStateLabel={saleStateLabel}
  orderStateColor={saleStateColor}
  itemCount={itemCount}
  total={total}
  unsyncedCount={unsyncedOrdersCount}
  onSyncPress={syncAllPendingOrders}
/>
```

**Required fields**: register, cashier, state, totals
**Optional**: sync badge (only when `unsyncedCount > 0`)

### User-Facing State System

Map technical states to user-facing labels via `utils/orderStateMapper.ts`:

```typescript
import { getUserFacingSaleState, getSaleStateLabel, getSaleStateColor } from '../utils/orderStateMapper';

const saleState = getUserFacingSaleState({
  basket,
  order: currentOrder,
  blockers: validateBasket(basket),
  paymentLines: currentOrder?.paymentLines,
});

const saleStateLabel = getSaleStateLabel(saleState);
const saleStateColor = getSaleStateColor(saleState);
```

**User-facing states**: Empty, Building, Needs Attention, Ready, Preparing, Processing, Paid, Synced, Action Required

**Never expose technical states** (`draft`, `pending`, `processing`) directly to users.

### Primary CTA Hierarchy

Every screen state must have exactly one dominant call-to-action:

```typescript
const getPrimaryCTA = () => {
  switch (saleState) {
    case 'building':
    case 'ready-for-checkout':
      return (
        <Button type="primary" size="large" onPress={handleCheckout}>
          Complete Order
        </Button>
      );

    case 'needs-attention':
      return (
        <Button type="warning" size="large" onPress={openBlockersModal}>
          Fix {blockers.length} {blockers.length === 1 ? 'Issue' : 'Issues'}
        </Button>
      );

    case 'paid':
    case 'synced':
      return (
        <Button type="success" size="large" onPress={handleNewSale}>
          New Sale
        </Button>
      );

    default:
      return null;
  }
};
```

**Visual hierarchy**:

- **Primary**: Large, full-width, high-contrast color
- **Secondary**: Medium, grouped, less prominent
- **Tertiary**: Small text links, destructive actions (red)

### Basket Validation & Blockers

Validate basket before checkout and surface blockers inline:

```typescript
const validateBasket = (basket: Basket): BasketBlocker[] => {
  const blockers: BasketBlocker[] = [];

  if (basket.discount && !basket.customerEmail) {
    blockers.push({
      id: 'customer-required',
      type: 'warning',
      message: 'Customer email required for loyalty discount',
      action: {
        label: 'Add Customer',
        onPress: () => openCustomerModal(),
      },
    });
  }

  if (unsyncedOrdersCount > 0) {
    blockers.push({
      id: 'unsynced-orders',
      type: 'info',
      message: `${unsyncedOrdersCount} orders pending sync`,
      action: {
        label: 'Retry Sync',
        onPress: () => syncAllPendingOrders(),
      },
    });
  }

  return blockers;
};
```

Render blockers using `BasketBlockers` component:

```typescript
{blockers.length > 0 && (
  <BasketBlockers blockers={blockers} />
)}
```

### Recovery Modals

Replace `Alert.alert` with `RecoveryModal` for all error scenarios:

```typescript
<RecoveryModal
  visible={showRecoveryModal}
  type="error"
  title="Card Payment Declined"
  message="The card was declined by the bank. No charge was completed."
  actions={[
    {
      label: 'Try Again',
      type: 'primary',
      onPress: () => retryPayment()
    },
    {
      label: 'Choose Another Method',
      type: 'secondary',
      onPress: () => changePaymentMethod()
    },
    {
      label: 'Cancel Order',
      type: 'tertiary',
      destructive: true,
      onPress: () => cancelOrder()
    }
  ]}
/>
```

**Recovery action types**:

- `primary`: Main recovery path (e.g., "Try Again")
- `secondary`: Alternative path (e.g., "Choose Another Method")
- `tertiary`: Escape/cancel action (e.g., "Cancel Order")

**Never use `Alert.alert` for**:

- Payment errors
- Sync failures
- Terminal disconnections
- Validation errors

**Still use `Alert.alert` for**:

- Destructive confirmations (delete, clear all)
- Manager approval prompts
- Critical system errors

### Interruption Detection & Resume

Detect interrupted operations on app open:

```typescript
const { interruptionState, resumeDraftSale, resumeCheckout, recoverPayment } = useInterruptionRecovery();

{interruptionState.type !== 'none' && (
  <InterruptionBanner
    type={interruptionState.type}
    onResume={() => {
      switch (interruptionState.type) {
        case 'draft-sale':
          resumeDraftSale();
          break;
        case 'interrupted-checkout':
          resumeCheckout(interruptionState.data?.order?.id);
          break;
        case 'interrupted-payment':
          recoverPayment(interruptionState.data?.order?.id);
          break;
      }
    }}
    onDismiss={() => clearInterruption()}
  />
)}
```

**Interruption types**:

- `draft-sale`: Basket has items on app open
- `interrupted-checkout`: LocalOrder in `draft` state
- `interrupted-payment`: LocalOrder in `processing` state
- `unsynced`: Orders with `sync_status !== 'synced'`

### Sync State Language

Use reassuring operational language for sync states:

**Good**:

- "Order saved locally. Sync pending."
- "Order is paid and saved. Platform sync pending."
- "{n} orders pending sync. Continue selling."
- "Syncing to Shopify..."

**Bad**:

- "Sync failed"
- "Error syncing order"
- "Order not synced"

**Implementation**:

```typescript
const getSyncStatusMessage = (syncStatus: string, syncError?: string) => {
  switch (syncStatus) {
    case 'pending':
      return 'Order saved locally. Sync pending.';
    case 'syncing':
      return `Syncing to ${platform}...`;
    case 'failed':
      return 'Order is paid and saved. Platform sync pending.';
    case 'synced':
      return 'Order synced successfully.';
    default:
      return 'Sync status unknown.';
  }
};
```

### Payment Method Availability

Group payment methods by availability in `CheckoutModal`:

```typescript
const getPaymentMethodAvailability = (method: PaymentMethod, context: PaymentContext) => {
  switch (method) {
    case 'card-terminal':
      if (!context.terminalConnected) {
        return {
          availability: 'unavailable',
          reason: 'Terminal disconnected',
          action: { label: 'Reconnect', onPress: reconnectTerminal },
        };
      }
      return { availability: 'recommended' };

    case 'loyalty':
      if (!context.customerEmail) {
        return {
          availability: 'requires-customer',
          reason: 'Add customer email to use',
        };
      }
      return { availability: 'available' };
  }
};
```

**Availability states**:

- `recommended`: Primary payment methods (cash, connected terminal)
- `available`: Secondary methods (manual card, split tender)
- `requires-customer`: Needs customer email (loyalty, store credit)
- `requires-setup`: Needs configuration (terminal not set up)
- `unavailable`: Cannot be used (terminal disconnected)

**Render sections**:

```
┌─────────────────────────────────────┐
│ Recommended                         │
│ ✓ Card Terminal                     │
│ ✓ Cash                              │
├─────────────────────────────────────┤
│ Other Methods                       │
│ ○ Manual Card Entry                 │
│ ○ Split Payment                     │
├─────────────────────────────────────┤
│ Requires Customer                   │
│ ⚠ Loyalty Points                    │
│   Add customer email to use         │
├─────────────────────────────────────┤
│ Unavailable                         │
│ ✗ Square Terminal                   │
│   Terminal disconnected             │
│   [Reconnect]                       │
└─────────────────────────────────────┘
```

### Behavioural Analytics

Track all key UX events for continuous improvement:

```typescript
import { analyticsService } from '../services/analytics/AnalyticsService';

// Track sale started
analyticsService.track('sale_started', {
  cashierId,
  timestamp: Date.now(),
});

// Track item added
analyticsService.track('item_added', {
  productId,
  method: 'scan' | 'search' | 'browse' | 'recent',
  timestamp: Date.now(),
});

// Track checkout started
analyticsService.track('checkout_started', {
  itemCount,
  total,
  timestamp: Date.now(),
});

// Track payment completed
analyticsService.track('payment_completed', {
  method,
  duration: Date.now() - checkoutStartTime,
  timestamp: Date.now(),
});

// Track payment failed
analyticsService.track('payment_failed', {
  method,
  reason,
  timestamp: Date.now(),
});

// Track payment recovered
analyticsService.track('payment_recovered', {
  originalMethod,
  newMethod,
  duration: Date.now() - failureTime,
  timestamp: Date.now(),
});
```

**Key metrics to track**:

- Time from first item to payment
- Taps per sale
- Payment failure rate
- Payment recovery time
- Split tender completion rate
- Sync failure rate
- Product discovery method usage (scan vs search vs browse)
- Blocker frequency

---

## Component Library Extensions

### New Components

| Component            | Purpose                        | Location                            |
| -------------------- | ------------------------------ | ----------------------------------- |
| `SalesStatusHeader`  | Persistent context display     | `components/SalesStatusHeader.tsx`  |
| `BasketBlockers`     | Inline validation feedback     | `components/BasketBlockers.tsx`     |
| `RecoveryModal`      | Guided error recovery          | `components/RecoveryModal.tsx`      |
| `InterruptionBanner` | Resume interrupted operations  | `components/InterruptionBanner.tsx` |
| `SyncStatusBanner`   | Reassuring sync status         | `components/SyncStatusBanner.tsx`   |
| `SplitTenderSummary` | Split payment balance tracking | `components/SplitTenderSummary.tsx` |

### New Hooks

| Hook                      | Purpose                           | Location                           |
| ------------------------- | --------------------------------- | ---------------------------------- |
| `useInterruptionRecovery` | Detect and resume interrupted ops | `hooks/useInterruptionRecovery.ts` |
| `useRecentItems`          | Track recently added items        | `hooks/useRecentItems.ts`          |
| `useBestSellers`          | Load top-selling products         | `hooks/useBestSellers.ts`          |

### New Utilities

| Utility                    | Purpose                             | Location                    |
| -------------------------- | ----------------------------------- | --------------------------- |
| `orderStateMapper`         | Map technical to user-facing states | `utils/orderStateMapper.ts` |
| `getUserFacingSaleState()` | Compute current sale state          | `utils/orderStateMapper.ts` |
| `getSaleStateLabel()`      | Get state display label             | `utils/orderStateMapper.ts` |
| `getSaleStateColor()`      | Get state color                     | `utils/orderStateMapper.ts` |
