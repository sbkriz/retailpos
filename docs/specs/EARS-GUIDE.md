# How to Write an EARS Specification

> **EARS** = Easy Approach to Requirements Syntax  
> **Scope**: RetailPOS project — all feature areas  
> **Location**: All specs live under `docs/specs/[feature]/[actor-or-flow].md`

---

## What is EARS?

EARS is a structured natural-language syntax for writing software requirements. It eliminates ambiguity by forcing every requirement into one of five sentence patterns. Each pattern maps to a specific type of system behaviour, making requirements easy to read, review, and trace to code.

The five patterns are:

| Pattern                | Trigger                | Template                                                 |
| ---------------------- | ---------------------- | -------------------------------------------------------- |
| **Ubiquitous**         | Always true            | `The system shall [action].`                             |
| **Event-Driven**       | Triggered by an event  | `When [event], the system shall [action].`               |
| **State-Driven**       | True while in a state  | `While [state], the system shall [action].`              |
| **Optional Feature**   | Feature flag or config | `Where [feature is enabled], the system shall [action].` |
| **Unwanted Behaviour** | Error or edge case     | `If [condition], then the system shall [action].`        |

A sixth pattern combines two or more of the above for complex rules:

| Pattern     | Template                                                 |
| ----------- | -------------------------------------------------------- |
| **Complex** | `When [event] while [state], the system shall [action].` |

---

## File Structure

Every EARS spec file follows this structure:

```
# [Feature] – [Actor/Flow] EARS Requirements

> System, Actor, Date, Source

---

## Context
  - Narrative description of the feature and its actors
  - Actors table
  - Flow state machine (steps + permitted transitions)
  - Configuration defaults table (if applicable)

---

## 1. Ubiquitous Requirements
## 2. Event-Driven Requirements
## 3. State-Driven Requirements
## 4. Optional Feature Requirements
## 5. Unwanted Behaviour / Edge Cases
## 6. Complex Requirements
## 7. [Feature] Lifecycle Summary
## 8. Component Traceability        ← maps each requirement to its source file
```

---

## Section-by-Section Guide

### Header Block

```markdown
# [Feature] – [Actor/Flow] EARS Requirements

> **System**: RetailPOS – [subsystem name]
> **Actor**: [Primary actor, e.g. Cashier, Admin, System]
> **Date**: YYYY-MM-DD
> **Source**: `screens/[path]/`, `services/[path]/`, `hooks/[path]/`
```

The `Source` field links the spec to the actual implementation files it was derived from.

---

### Context Section

Before the numbered requirements, write a short prose section that:

1. Describes what the feature does and who uses it
2. Lists all actors in a table with their roles
3. Shows the flow state machine as a table of permitted step transitions
4. Lists any configurable defaults as a table

**Example — Actors table:**

```markdown
| Actor   | Role                                                         |
| ------- | ------------------------------------------------------------ |
| Admin   | Completes onboarding; configures platform, payment, hardware |
| Cashier | Uses the configured POS after onboarding is complete         |
| System  | Persists settings, validates connections, gates app entry    |
```

**Example — Step transition table:**

```markdown
| From                     | To (allowed)                                                 |
| ------------------------ | ------------------------------------------------------------ |
| `welcome`                | `platform_selection`                                         |
| `platform_selection`     | `platform_configuration` (online), `offline_setup` (offline) |
| `platform_configuration` | `payment_provider_setup`                                     |
| `summary`                | _(none — wizard complete)_                                   |
```

**Example — Configuration defaults table:**

```markdown
| Setting            | Default | Configurable in Settings after onboarding |
| ------------------ | ------- | ----------------------------------------- |
| `taxRate`          | (none)  | Yes — POS Config tab                      |
| `drawerOpenOnCash` | false   | Yes — POS Config tab                      |
| `maxSyncRetries`   | 3       | Yes — POS Config tab                      |
```

---

### 1. Ubiquitous Requirements

These are invariants — always true regardless of step or actor. Use them for:

- Data persistence rules (every setting must be saved before proceeding)
- Progress indicator behaviour
- Back-navigation data preservation
- Platform-mode branching rules

**Template:** `The system shall [action].`

**Examples:**

```
The system shall persist all settings entered in each step to SQLite before advancing to the next step.

The system shall display a progress indicator showing the current step number and total steps on every step except Welcome.

The system shall preserve all previously entered data when the user navigates back to a prior step.
```

---

### 2. Event-Driven Requirements

Triggered by a user action or system event. Use them for:

- What happens when the user taps a button
- What the system does when a step completes
- Automated transitions (e.g. connection test result → next step)

**Template:** `When [event], the system shall [action].`

Group related events under numbered sub-sections (2.1, 2.2, etc.) named after the step.

**Examples:**

```
When the admin taps "Get Started" on the Welcome step, the system shall navigate to the Platform Selection step.

When the admin selects "Offline Mode" on the Platform Selection step, the system shall navigate to the Offline Store Setup step, bypassing the Platform Configuration step.

When the admin taps "Confirm & Finish" on the Summary step, the system shall set the onboarding status to `completed` in the key-value store and navigate to the main POS screen.
```

**Tips:**

- Name the actor explicitly (`When the admin...`, `When the cashier...`)
- For automated transitions, name the trigger (`When the connection test succeeds...`)
- Derive from `OnboardingScreen.tsx` handler functions and step `onComplete` callbacks

---

### 3. State-Driven Requirements

True only while the wizard is in a particular step or mode. Use them for:

- What is shown or hidden in a given step
- Constraints that apply for the duration of a mode (online vs offline)
- Hardware step skip availability

**Template:** `While [state], the system shall [action].`

**Examples:**

```
While the wizard is in offline mode, the system shall include the Offline Store Setup and Staff Setup steps and exclude the Platform Configuration step.

While the wizard is in online mode, the system shall include the Platform Configuration step and exclude the Offline Store Setup and Staff Setup steps.

While the Printer Setup step is active, the system shall offer a "Skip" option that advances to the Scanner Setup step without requiring a printer connection.
```

---

### 4. Optional Feature Requirements

Conditional on a feature flag, environment variable, or hardware being present. Use them for:

- Mock service flags (`USE_MOCK_PAYMENT`, `USE_MOCK_SCANNER`, etc.)
- Hardware-dependent steps (printer, scanner)
- Platform-specific configuration fields

**Template:** `Where [feature is enabled], the system shall [action].`

**Examples:**

```
Where `USE_MOCK_PAYMENT` is true, the system shall use mock payment service implementations during the Payment Provider step connection test.

Where a printer is detected during the Printer Setup step, the system shall enable the "Test Print" button and display the discovered device name.

Where the selected platform is Shopify, the system shall display the Shopify-specific fields (store URL, API key, access token) in the Platform Configuration step.
```

---

### 5. Unwanted Behaviour / Edge Cases

Defensive requirements — what the system must do when something goes wrong. Use them for:

- Failed connection tests
- Missing required fields
- Duplicate PIN entry
- Onboarding re-entry after completion

**Template:** `If [condition], then the system shall [action].`

**Examples:**

```
If the admin attempts to advance from the Platform Configuration step without entering all required credentials, then the system shall display a validation error and prevent navigation.

If the platform connection test fails during the Platform Configuration step, then the system shall display the error message and allow the admin to correct the credentials and retry.

If the admin attempts to create an admin user with a PIN that is already in use, then the system shall reject the submission and display a "PIN already taken" error.

If the app is launched and the onboarding status is already `completed`, then the system shall skip the wizard entirely and navigate directly to the Login screen.
```

---

### 6. Complex Requirements

Combine two or more patterns for rules with both an event trigger and a state condition, or multiple simultaneous effects.

**Template:** `When [event] while [state], the system shall [action].`

**Examples:**

```
When the admin completes the POS Setup step while in offline mode, the system shall persist the store name, tax rate, currency symbol, and drawer-on-cash setting to POSConfigService and navigate to the Auth Method Setup step.

When the admin taps "Confirm & Finish" on the Summary step and all required settings are present, the system shall simultaneously set onboarding status to `completed`, call `posConfig.load()`, and navigate to the Login screen.
```

---

### 7. Lifecycle Summary

End every spec with a visual flow diagram and a configuration defaults table.

**Diagram format (online path):**

```
Welcome → Platform Selection → Platform Configuration → Payment Provider
  → Printer Setup → Scanner Setup → POS Config → Auth Method Setup
  → Admin User → Summary → [Login Screen]
```

**Diagram format (offline path):**

```
Welcome → Platform Selection → Offline Store Setup → Admin User
  → Staff Setup → Payment Provider → Printer Setup → Scanner Setup
  → POS Config → Auth Method Setup → Summary → [Login Screen]
```

---

## Component Traceability (Required)

Every EARS spec must end with a **Section 8: Component Traceability** table that maps each event-driven requirement to the screen, hook, or service that implements it.

**Format:**

```markdown
## 8. Component Traceability

| Requirement (summary)                  | Component / Hook / Service              | Source File                       |
| -------------------------------------- | --------------------------------------- | --------------------------------- |
| Platform selected → navigate to config | `OnboardingScreen.handlePlatformSelect` | `screens/OnboardingScreen.tsx`    |
| Offline setup complete → save settings | `useEcommerceSettings.saveSettings`     | `hooks/useEcommerceSettings.ts`   |
| Onboarding complete → set status       | `OnboardingProvider.setIsOnboarded`     | `contexts/OnboardingProvider.tsx` |
```

**Rules:**

- Point directly to the source file — no intermediate documentation layer
- For multi-step flows, add a short wiring note showing the handler chain
- If a requirement is fulfilled by a context action rather than a screen, link to the context file
- Keep the summary column short — one line matching the requirement's trigger

**Do not create separate flow documentation files.** The spec + the source code are the two sources of truth.

---

## How to Derive Requirements from Code

EARS specs for RetailPOS are always grounded in the actual implementation. Follow this process:

### Step 1 — Read the screen orchestrator

Start with the top-level screen (e.g. `OnboardingScreen.tsx`). The step enum and `renderStep()` switch define the state machine. Each `handleXxx` function maps to an event-driven requirement.

### Step 2 — Read each step component

Open each step file in `screens/onboarding/`. The `onComplete` / `onNext` / `onBack` props define the transitions. Required fields and validation logic map to unwanted behaviour requirements.

### Step 3 — Read the context

Open the relevant context (e.g. `OnboardingProvider.tsx`). The `setIsOnboarded()` function and `ONBOARDING_STATUS_KEY` map to ubiquitous and event-driven requirements.

### Step 4 — Read the hooks

Open the hooks called by each step (e.g. `useEcommerceSettings.ts`, `usePaymentSettings.ts`). The `saveSettings()` and `loadSettings()` calls map to event-driven requirements. Validation logic maps to unwanted behaviour requirements.

### Step 5 — Read the services

Open the services called during onboarding (e.g. `POSConfigService.ts`, `ServiceConfigBridge.ts`). The `updateAll()` and `configureFromStorage()` calls map to complex requirements.

### Step 6 — Read the config flags

Check `.env.example` for `USE_MOCK_*` flags. Each flag maps to an optional feature requirement.

---

## Naming and Location Conventions

| What            | Convention                          | Example                           |
| --------------- | ----------------------------------- | --------------------------------- |
| Spec file       | `docs/specs/[feature]/[flow].md`    | `docs/specs/onboarding/wizard.md` |
| Section headers | `## N. [Pattern Name] Requirements` | `## 2. Event-Driven Requirements` |
| Sub-sections    | `### N.M [Step or Feature Area]`    | `### 2.3 POS Config Step`         |
| Step names      | `snake_case` in backticks           | `` `platform_configuration` ``    |
| Screen names    | PascalCase in backticks             | `` `OnboardingScreen` ``          |
| Hook names      | camelCase in backticks              | `` `useEcommerceSettings` ``      |
| Config flags    | SCREAMING_SNAKE_CASE in backticks   | `` `USE_MOCK_PAYMENT` ``          |
| Code references | Inline code                         | `POSConfigService.ts`             |
| Config values   | Exact values from source            | `'completed'`, `3`, `false`       |

---

## Quality Checklist

Before committing a spec, verify:

- [ ] Every requirement uses exactly one EARS pattern (or the complex combination)
- [ ] Every "shall allow" in sections 2–3 has a corresponding "If not..." in section 5
- [ ] All step names match the actual type values in the relevant screen/service
- [ ] All config defaults match the actual values in the relevant service and `.env.example`
- [ ] The step transition table matches the actual handler logic in the orchestrating screen
- [ ] The `Source` header links to the correct screen, hook, and service files
- [ ] The lifecycle summary diagram is consistent with the actual flow arrays/state machines
- [ ] No business logic is invented — every rule traces to code

After writing or updating a spec, always perform an integration review:

- [ ] Read every requirement in sections 1–6 against the actual source files
- [ ] Confirm audit logging is wired up for all success and failure paths (if applicable)
- [ ] Confirm fallback/error paths in services match what the spec describes
- [ ] Fix any gaps found in the implementation before considering the spec complete
- [ ] Update this guide's "Existing Specs" table if a new spec was added

---

## Existing Specs (Reference)

| Spec                            | File                              | Key patterns demonstrated                                         |
| ------------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| Onboarding – Wizard             | `docs/specs/onboarding/wizard.md` | Dual path (online/offline), hardware skips, mock flags            |
| Authentication – Login          | `docs/specs/auth/login.md`        | Provider pattern, hardware methods, platform token, audit log     |
| Catalog – Products & Categories | `docs/specs/catalog/products.md`  | Multi-platform mappers, pagination, variant picker, category tree |
| Basket – Shopping Cart          | `docs/specs/basket/basket.md`     | Service/context split, checkout flow, dual UI surfaces, audit log |
