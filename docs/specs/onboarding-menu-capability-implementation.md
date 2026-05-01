# Implementation Plan — Minimal Onboarding + Capability-Driven More Menu

> **System**: RetailPOS – Onboarding & Navigation Architecture
> **Date**: 2026-04-30
> **Related**: `docs/specs/platform-capability-rollout.md`
> **Goal**: Reduce onboarding to minimum required setup and move feature setup/discovery to More menu based on selected platform capabilities.

> **Specification gate**: This architecture is valid only when source specs remain aligned:
> `docs/specs/onboarding/wizard.md`, `docs/specs/settings/settings.md`, `docs/specs/settings/settings-tabs.md`, `docs/specs/checkout/checkout.md`, `docs/specs/sync/sync.md`, `docs/specs/refunds/refunds.md`.

---

## 1) Problem statement

Current onboarding is long and platform-agnostic in structure. It asks for many settings up front regardless of platform capability or immediate necessity.

This causes:

- Slow time-to-first-sale
- Setup steps for features that may be unsupported on selected platform
- Static More menu that only uses role-based visibility, not platform capability visibility

We need to shift to:

1. **Minimal onboarding** (Platform, User, Peripherals)
2. **Capability-driven setup after login** from More menu
3. **Dynamic More menu items** loaded by role + selected platform + capability status

---

## 2) Target UX model

## 2.1 New onboarding (3-step)

Only minimum required to operate POS:

1. **Platform**
   - Select platform
   - Enter required credentials (or offline store basics)
   - Validate connection for online platforms
2. **User**
   - Create admin user (name, pin, role)
   - Set default auth method baseline (PIN always available)
3. **Peripherals**
   - Configure printer/scanner/payment terminal at basic level
   - Allow skip with explicit "configure later in More" option

After step 3, onboarding ends and POS is usable.

## 2.2 Post-onboarding setup model (More menu)

All non-critical setup moves to More menu sections and is shown only when relevant:

- Discounts setup
- Gift card setup
- Refund setup
- Sync settings
- Platform-specific advanced setup
- Optional modules (KDS, display, multiregister)

If a feature is unsupported or not recommended for selected platform, its setup entry is hidden or disabled with reason.

---

## 3) Capability-driven navigation architecture

## 3.1 New decision inputs

Menu visibility must use all three dimensions:

- **Role access** (existing `canAccessMoreMenuItem`)
- **Platform selection** (from configured ecommerce settings)
- **Feature capability** (`supported` | `custom` | `not_recommended`)

## 3.2 Proposed visibility rule

A More item is visible if:

- role allows it
- AND platform capability is not `not_recommended`
- AND for `custom` items, adapter readiness is true or item shown as disabled-with-action

Pseudo-rule:

```ts
visible = roleAllowed && capability !== 'not_recommended';
interactive = visible && (capability === 'supported' || adapterReady);
```

## 3.3 Source of truth

Use a single menu composition service:

- `services/navigation/MoreMenuComposer.ts`

Inputs:

- `userRole`
- `platform`
- `platformCapabilities`
- `adapterReadiness`

Output:

- ordered list of menu items with status:
  - `enabled`
  - `disabled`
  - `hidden`

---

## 4) Required architecture changes

## 4.1 Onboarding flow refactor

Current `OnboardingScreen.tsx` has many steps (`welcome`, `platform_selection`, `platform_configuration`, `offline_setup`, `staff_setup`, `payment_provider_setup`, `printer_setup`, `scanner_setup`, `pos_setup`, `auth_method_setup`, `admin_user`, `summary`).

Change to:

```ts
type OnboardingStep = 'platform_setup' | 'admin_user_setup' | 'peripherals_setup';
```

Refactor impacts:

- merge/remove current step screens
- simplify `STEP_ORDER` and progress indicator
- remove summary requirement from mandatory path
- defer non-essential settings to More

## 4.2 Introduce setup completion state (phase-based)

Add onboarding completion metadata:

```ts
interface SetupState {
  onboardingComplete: boolean;
  completedPhases: {
    platform: boolean;
    user: boolean;
    peripherals: boolean;
  };
  deferredFeatures: string[];
}
```

Persist in key-value store to support:

- showing setup reminders in More
- tracking unfinished optional configurations

## 4.3 Dynamic More menu composition

Current `MoreNavigator.tsx` uses static `allMenuItems` filtered only by role.

Refactor:

- move static array to config registry with capability keys
- compute rendered list from composer service
- include item state badges: `Available`, `Needs setup`, `Unsupported`

Example item metadata:

```ts
interface MoreMenuDefinition {
  key: MoreMenuKey;
  label: string;
  route: keyof MoreStackParamList;
  requiredRole: UserRole[];
  capabilityKey?: keyof PlatformCapabilities;
  requiresAdapterReady?: boolean;
  setupGroup?: 'core' | 'advanced' | 'optional';
}
```

## 4.4 Role access and platform access split

Keep `utils/roleAccess.ts` only for role logic.

Add platform/capability gating in a new layer:

- `utils/menuCapabilityAccess.ts`

This avoids overloading role access with backend capability concerns.

## 4.5 Settings screen tab visibility by capability

Current `SettingsScreen.tsx` has static `TAB_ORDER`.

Refactor:

- `TAB_ORDER` becomes computed at runtime
- show only tabs relevant for selected platform/capabilities
- keep generic/core tabs always available (General, POS, Auth, Printer, Scanner)

Optional tabs become capability-driven (examples):

- Discounts settings: hidden/disabled if unsupported
- Gift card settings: shown only for supported/custom-ready platforms
- Refund settings: shown for supported/custom-ready platforms

---

## 5) Proposed new components/services

## 5.1 Capability layer

- `utils/platformCapabilities.ts` (already proposed in related doc)
- `services/platform/PlatformCapabilityService.ts`

Responsibilities:

- expose selected platform capabilities
- expose “why not available” strings for UI

## 5.2 Navigation composition layer

- `services/navigation/MoreMenuComposer.ts`
- `services/navigation/SettingsTabComposer.ts`

Responsibilities:

- generate platform-specific menu and settings tab definitions
- maintain deterministic ordering

## 5.3 Setup status layer

- `services/setup/SetupProgressService.ts`

Responsibilities:

- track deferred setup tasks
- power “Complete setup” callouts in More menu

---

## 6) Data model changes

## 6.1 Extend persisted ecommerce settings

Add non-breaking fields:

```ts
interface StoredECommerceSettings {
  // existing fields...
  capabilityProfileVersion?: string;
  selectedPlatform?: string;
}
```

## 6.2 Add setup progress record

Key suggestion: `setup.progress`

```ts
{
  onboardingComplete: true,
  completedPhases: { platform: true, user: true, peripherals: true },
  deferredFeatures: ['discounts', 'giftcards', 'refunds'],
  updatedAt: 0
}
```

---

## 7) Concrete file-level implementation plan

## Phase 1 — foundation (no UX breaking)

1. Add `platformCapabilities` source
2. Add `MoreMenuComposer` (parallel path, not yet wired)
3. Add `SetupProgressService`

Files:

- `utils/platformCapabilities.ts` (new)
- `services/platform/PlatformCapabilityService.ts` (new)
- `services/navigation/MoreMenuComposer.ts` (new)
- `services/setup/SetupProgressService.ts` (new)

## Phase 2 — onboarding simplification

1. Refactor `screens/OnboardingScreen.tsx` to 3 steps
2. Keep old step components reusable where practical
3. Persist setup progress on completion

Files:

- `screens/OnboardingScreen.tsx`
- `contexts/OnboardingProvider.tsx`
- selected onboarding step screens

## Phase 3 — dynamic More menu

1. Replace static menu list in `navigation/MoreNavigator.tsx`
2. Use composer output (`enabled/disabled/hidden`)
3. Add item subtitle/status text for disabled items

Files:

- `navigation/MoreNavigator.tsx`
- `utils/roleAccess.ts` (minimal touch)
- `utils/menuCapabilityAccess.ts` (new)

## Phase 4 — dynamic settings tabs

1. Compute tab order in `SettingsScreen.tsx` based on capability
2. Add setup CTA sections for deferred feature areas

Files:

- `screens/SettingsScreen.tsx`
- `screens/settings/*` (only where visibility messaging required)

## Phase 5 — docs and QA

1. Update onboarding spec
2. Update settings/menu specs
3. Add platform × menu visibility QA matrix

Files:

- `docs/specs/onboarding/wizard.md`
- `docs/specs/settings/settings.md`
- `docs/specs/settings/settings-tabs.md`
- `docs/specs/platform-capability-rollout.md` (cross-link updates)

---

## 8) UX behavior requirements

## 8.1 More menu states

Each dynamic item should support:

- **Enabled**: navigates normally
- **Disabled**: visible with reason + optional "Learn more"/"Setup" action
- **Hidden**: not shown when feature is not relevant for platform

## 8.2 Setup reminders

If deferred setup exists, show at top of More menu:

- "Finish setup" section with pending items
- deep links to relevant settings screens

## 8.3 Guard rails

Even if UI incorrectly exposes a feature, service layer must still guard unsupported operations and return typed non-throw errors.

---

## 9) Acceptance criteria

1. Onboarding has only 3 mandatory steps (platform, user, peripherals)
2. POS can reach Sale screen and process baseline order flow immediately after onboarding
3. More menu items differ correctly by platform capability and role
4. Unsupported feature items are hidden or disabled with clear reason
5. Settings tabs shown are platform-appropriate
6. No checkout regression for any platform

---

## 10) Risks and mitigations

## Risk 1: Feature discoverability drops after onboarding simplification

Mitigation:

- Add setup reminders in More
- Add “Recommended next setup” cards on first login

## Risk 2: Dynamic menus create inconsistent navigation expectations

Mitigation:

- Stable ordering
- explicit status labels
- keep core items always present

## Risk 3: Capability map drift from real adapter behavior

Mitigation:

- Version capability profiles
- run QA matrix on each release
- add adapter readiness checks in runtime

---

## 11) Open decisions to confirm

1. Should disabled (unsupported/custom-not-ready) menu items be visible or fully hidden?
2. Should manager and admin see the same capability-gated items by default?
3. Do we want a dedicated "Setup Center" screen under More for deferred items?
4. Should onboarding keep optional "Quick Advanced Setup" toggle for power users?

---

## 12) Recommended next implementation order

1. Build capability + composer foundations
2. Wire dynamic More menu first (high impact, low risk)
3. Refactor onboarding to 3-step flow
4. Make settings tabs dynamic
5. Align and update existing specs

---

## 13) Pre-implementation validation checklist

- Minimal onboarding (platform/user/peripherals) is the authoritative path in `docs/specs/onboarding/wizard.md`
- Deferred setup policy is documented in onboarding + settings specs
- More menu and settings tabs are documented as capability-composed, not static role-only
- Checkout and sync specs no longer assume universal draft-first semantics
- Refund spec includes platform capability tiers and mode semantics
- `docs/specs/platform-capability-rollout.md` Section 13 remains satisfied

Do not start code changes until this checklist remains true in the latest docs state.
