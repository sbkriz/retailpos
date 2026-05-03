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
