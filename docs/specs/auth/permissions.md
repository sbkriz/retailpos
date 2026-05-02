# Roles & Granular Permissions – EARS Requirements

> **System**: RetailPOS – Custom Permission Sets & Manager Approval Flows
> **Actor**: Admin, Manager, Cashier, System
> **Date**: 2026-05-02
> **Source**: `utils/roleAccess.ts`, `utils/menuCapabilityAccess.ts`, `services/navigation/MoreMenuComposer.ts`, `services/navigation/SettingsTabComposer.ts`, `repositories/UserRepository.ts`, `contexts/AuthProvider.tsx`

---

## Context

### Current State

The POS has three fixed roles (`admin`, `manager`, `cashier`) with hardcoded permission sets in `utils/roleAccess.ts`. Role-based access is enforced at the menu item level (`canAccessMoreMenuItem`) and settings tab level (`evaluateCombinedAccess`). There is no concept of custom permission sets, per-action overrides, or manager approval/override flows.

### Target State

This spec extends the permission model with:

1. **Custom permission sets** — admins can create named permission profiles that override the defaults for specific actions, then assign them to individual users.
2. **Action-level permissions** — a fine-grained registry of every sensitive action in the POS (e.g. `discount:apply`, `refund:process`, `inventory:adjust`, `order:void`), each with a default role requirement and an optional override.
3. **Manager approval / override flows** — when a cashier attempts an action they are not permitted to perform, the system prompts for a manager PIN or biometric to approve the action in-context without requiring the cashier to log out.

### Architectural Approach

The existing `canAccessMoreMenuItem` / `evaluateCombinedAccess` pattern is the right abstraction. The extension adds:

- A `PermissionService` singleton that resolves whether a given user/role can perform a given action, consulting both the default role matrix and any custom overrides.
- A `PermissionRepository` (SQLite) storing custom permission sets and user-level overrides.
- A `ManagerApprovalService` that orchestrates the in-context PIN/biometric challenge.

The `roleAccess.ts` defaults remain as the fallback — custom overrides layer on top.

### Platform Capability Gating

**Permissions and roles are entirely local** — `PermissionService`, `ManagerApprovalService`, and all SQLite tables are independent of the e-commerce platform. No capability keys are required and no entries in `PLATFORM_CAPABILITY_MATRIX` need to change for this feature.

The permission system gates actions within the POS itself. Platform capabilities gate what the POS can do with the platform's API. These are orthogonal concerns — a cashier may be permitted to process a refund (`refund:process` action allowed) but the platform may not support refunds (`refunds: 'not_recommended'`). Both checks apply independently.

### New SQLite Tables

| Table                  | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `permission_sets`      | Named permission profiles (e.g. "Senior Cashier") |
| `permission_overrides` | Per-action overrides within a permission set      |
| `user_permission_sets` | Many-to-many: users assigned to permission sets   |
| `approval_log`         | Audit trail of manager approval events            |

### Action Registry

Every sensitive action is identified by a dot-namespaced string key. The default minimum role is the fallback when no override exists.

| Action key               | Default minimum role | Description                            |
| ------------------------ | -------------------- | -------------------------------------- |
| `discount:apply`         | `cashier`            | Apply a discount code to the basket    |
| `discount:manual`        | `manager`            | Apply a manual/custom discount amount  |
| `refund:process`         | `manager`            | Process a refund or return             |
| `order:void`             | `manager`            | Void an unpaid order                   |
| `order:reopen`           | `manager`            | Reopen a completed order for exchange  |
| `inventory:adjust`       | `manager`            | Manually adjust stock levels           |
| `inventory:count`        | `manager`            | Start or finalise an inventory count   |
| `price:override`         | `manager`            | Override the price of a basket item    |
| `customer:edit`          | `manager`            | Edit a customer profile                |
| `loyalty:adjust`         | `manager`            | Manually adjust loyalty points         |
| `store_credit:issue`     | `manager`            | Issue store credit to a customer       |
| `cash_drawer:open`       | `cashier`            | Open the cash drawer outside of a sale |
| `report:view`            | `manager`            | View daily/period reports              |
| `report:export`          | `manager`            | Export report data                     |
| `settings:view`          | `manager`            | Access the Settings screen             |
| `settings:edit`          | `admin`              | Save changes in Settings               |
| `user:create`            | `admin`              | Create a new user                      |
| `user:edit`              | `admin`              | Edit an existing user                  |
| `user:delete`            | `admin`              | Delete a user                          |
| `purchase_order:create`  | `manager`            | Create a purchase order                |
| `purchase_order:receive` | `manager`            | Receive goods against a purchase order |
| `exchange:process`       | `manager`            | Process an exchange                    |
| `sync:retry`             | `manager`            | Manually retry a failed sync           |

---

## 1. Ubiquitous Requirements

**1.1** `PermissionService.can(userId, action)` shall be the single authoritative check for whether a user may perform a given action — no screen, hook, or service shall hardcode role comparisons for action-level checks.

**1.2** `PermissionService.can()` shall resolve permissions in the following priority order:

1. User-level permission set overrides (highest priority)
2. Role-level default from the action registry
3. Deny (lowest priority / unknown action)

**1.3** The three built-in roles (`admin`, `manager`, `cashier`) shall always exist and cannot be deleted or renamed.

**1.4** `admin` role shall implicitly have permission for all actions — no override can restrict an admin.

**1.5** Custom permission sets shall only be able to grant permissions up to the assigning admin's own role level — a manager cannot create a permission set that grants `admin`-only actions.

**1.6** All permission changes (create/edit/delete permission set, assign/unassign user) shall be recorded to `AuditLogService`.

**1.7** `PermissionService` shall cache the resolved permission map for the currently logged-in user in memory and invalidate the cache when the user's permission sets change.

---

## 2. Event-Driven Requirements

### 2.1 Permission Check — Standard Flow

**2.1.1** When any screen or service calls `PermissionService.can(userId, action)`, the system shall:

1. Load the user's assigned permission sets from `user_permission_sets`.
2. Check each set's `permission_overrides` for the action key.
3. If an override exists with `granted: true`, return `true`.
4. If an override exists with `granted: false`, return `false`.
5. If no override exists, fall back to the action registry default role and compare against the user's base role.

**2.1.2** When `PermissionService.can()` is called for an unknown action key, the system shall return `false` and log a warning.

**2.1.3** When `MoreMenuComposer` composes the menu, the system shall call `PermissionService.can(userId, action)` for each action-gated menu item in addition to the existing role and capability checks.

**2.1.4** When `SettingsTabComposer` composes the settings tabs, the system shall call `PermissionService.can(userId, 'settings:view')` as the gate for all settings tabs.

### 2.2 Manager Approval Flow

**2.2.1** When a cashier attempts an action for which `PermissionService.can(cashierId, action)` returns `false`, the system shall display a `ManagerApprovalModal` with the action description and a PIN/biometric input.

**2.2.2** When the `ManagerApprovalModal` is displayed, the system shall prompt: "Manager approval required for: {actionDescription}. Please ask a manager to authenticate."

**2.2.3** When a manager enters their PIN in the `ManagerApprovalModal`, the system shall call `AuthService.authenticate('pin', pin)` and verify the authenticated user has `PermissionService.can(managerId, action) === true`.

**2.2.4** When the manager authentication succeeds and the manager has permission for the action, the system shall:

1. Record an `approval_log` entry with `actionKey`, `requestingUserId`, `approvingUserId`, `timestamp`.
2. Record an audit log entry `permission:approved`.
3. Dismiss the modal and proceed with the original action.

**2.2.5** When the manager authentication fails (wrong PIN), the system shall display "Incorrect PIN. Please try again." and allow retry — the modal remains open.

**2.2.6** When the authenticated manager does not have permission for the action (e.g. a manager trying to approve an `admin`-only action), the system shall display "This action requires admin approval." and not proceed.

**2.2.7** When the cashier dismisses the `ManagerApprovalModal` without completing approval, the system shall cancel the original action and return to the previous state.

**2.2.8** When `ManagerApprovalService.requestApproval(action, requestingUserId)` is called, the system shall return a `Promise<ApprovalResult>` that resolves when the modal is dismissed — `{ approved: true, approvingUserId }` on success, `{ approved: false }` on cancellation or failure.

### 2.3 Permission Sets — Admin Management

**2.3.1** When an admin navigates to Settings → User Management → Permission Sets, the system shall display all `permission_sets` rows with name, description, and the count of users assigned.

**2.3.2** When an admin creates a permission set, the system shall persist a `permission_sets` row with `name`, `description`, `createdBy`, and `createdAt`, and record an audit log entry `permission_set:created`.

**2.3.3** When an admin edits a permission set, the system shall display the full action registry with the current override state for each action (granted / denied / default). The admin may toggle any action to `granted`, `denied`, or `default` (inherits role default).

**2.3.4** When an admin saves a permission set, the system shall upsert `permission_overrides` rows for each non-default action and delete rows for actions reset to default, then record an audit log entry `permission_set:updated`.

**2.3.5** When an admin deletes a permission set, the system shall delete the set and all associated `permission_overrides` and `user_permission_sets` rows, and record an audit log entry `permission_set:deleted`.

### 2.4 Permission Sets — User Assignment

**2.4.1** When an admin views a user's profile in User Management, the system shall display the user's assigned permission sets as a list of tags.

**2.4.2** When an admin assigns a permission set to a user, the system shall insert a `user_permission_sets` row and invalidate `PermissionService`'s cache for that user, and record an audit log entry `permission_set:assigned`.

**2.4.3** When an admin removes a permission set from a user, the system shall delete the `user_permission_sets` row and invalidate the cache, and record an audit log entry `permission_set:unassigned`.

### 2.5 Price Override (Example Action-Gated Flow)

**2.5.1** When a cashier taps the price of a basket item and `PermissionService.can(cashierId, 'price:override')` returns `false`, the system shall trigger the manager approval flow for `price:override`.

**2.5.2** When manager approval is granted for `price:override`, the system shall open the price override input for the item and allow the cashier to enter a new price.

**2.5.3** When the price override is saved, the system shall record an audit log entry `price:overridden` with `originalPrice`, `newPrice`, `itemId`, `approvingManagerId`.

### 2.6 Manual Discount (Example Action-Gated Flow)

**2.6.1** When a cashier attempts to apply a manual discount amount (not a code) and `PermissionService.can(cashierId, 'discount:manual')` returns `false`, the system shall trigger the manager approval flow for `discount:manual`.

**2.6.2** When manager approval is granted for `discount:manual`, the system shall allow the cashier to enter the discount amount and apply it to the basket.

---

## 3. State-Driven Requirements

**3.1** While `ManagerApprovalModal` is open, the underlying screen shall be non-interactive — a semi-transparent overlay shall block all touches behind the modal.

**3.2** While the manager PIN is being verified in `ManagerApprovalModal`, the confirm button shall show a loading indicator and be non-interactive.

**3.3** While `PermissionService` cache is being rebuilt (after a permission set change), `can()` calls shall fall back to the role-default matrix — no action shall be incorrectly blocked during the rebuild.

**3.4** While a user has no assigned permission sets, `PermissionService.can()` shall use only the role-default matrix.

---

## 4. Optional Feature Requirements

**4.1** Where `ManagerApprovalService` is configured with `allowBiometric: true`, the `ManagerApprovalModal` shall offer a biometric option alongside PIN entry.

**4.2** Where an approval is granted, the system may optionally time-box the approval — `approvalExpiresAt` can be set so the same manager does not need to re-approve the same action within a short window (e.g. 5 minutes). This is configurable via `settings.permissions.approvalWindowSeconds`.

**4.3** Where `approval_log` entries exist for a user, the admin may view the approval history in the user's profile.

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If `PermissionService.can()` throws (e.g. database error), the system shall default to `false` (deny) and log the error — no action shall be silently permitted due to a permission check failure.

**5.2** If a user's role is changed while they are logged in, the system shall invalidate the `PermissionService` cache on the next action check — the new role takes effect immediately without requiring re-login.

**5.3** If a permission set is deleted while a user is logged in with that set assigned, the system shall invalidate the cache — the user falls back to role defaults for the deleted set's actions.

**5.4** If a cashier repeatedly fails manager approval (e.g. 5 consecutive failures), the system shall lock the approval flow for 60 seconds and notify the admin via `notificationService` — this prevents brute-force PIN guessing via the approval modal.

**5.5** If the `ManagerApprovalModal` is dismissed by the OS (e.g. app backgrounded), the system shall treat it as a cancellation — the original action is not proceeded with.

**5.6** A permission set shall not be able to grant `admin`-only actions to a `cashier` or `manager` role user — `PermissionService` shall enforce this ceiling at resolution time, not just at creation time.

---

## 6. Complex Requirements

**6.1** When `PermissionService.can(userId, action)` is called, the resolution algorithm shall be:

```
1. Load user record → get base role
2. If role === 'admin' → return true (admin bypass)
3. Load user_permission_sets for userId → get list of permission_set_ids
4. For each set (ordered by priority desc):
   a. Load permission_overrides where action_key = action
   b. If override.granted = true → return true
   c. If override.granted = false → return false
5. Load action registry default for action → get minimumRole
6. Return roleRank(user.role) >= roleRank(minimumRole)
   where roleRank: admin=3, manager=2, cashier=1
```

**6.2** When `ManagerApprovalService.requestApproval(action, requestingUserId)` resolves with `approved: true`, the calling service shall proceed with the action using the **requesting user's** session context (not the approving manager's) — the manager approval is an authorisation event, not a session switch.

---

## 7. Component Traceability

| Requirement (summary)                        | Component / Service                                                        | Source File (target)                             |
| -------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| `PermissionService.can(userId, action)`      | `PermissionService` singleton                                              | `services/permissions/PermissionService.ts`      |
| Action registry (default role matrix)        | `ACTION_REGISTRY` constant                                                 | `utils/actionRegistry.ts`                        |
| `permission_sets` table                      | `PermissionRepository`                                                     | `repositories/PermissionRepository.ts`           |
| `permission_overrides` table                 | `PermissionRepository`                                                     | `repositories/PermissionRepository.ts`           |
| `user_permission_sets` table                 | `PermissionRepository`                                                     | `repositories/PermissionRepository.ts`           |
| `approval_log` table                         | `PermissionRepository`                                                     | `repositories/PermissionRepository.ts`           |
| Manager approval modal                       | `ManagerApprovalModal`                                                     | `components/ManagerApprovalModal.tsx`            |
| `ManagerApprovalService.requestApproval()`   | `ManagerApprovalService`                                                   | `services/permissions/ManagerApprovalService.ts` |
| Approval audit log                           | `ManagerApprovalService` → `auditLogService.log('permission:approved')`    | `services/permissions/ManagerApprovalService.ts` |
| Approval failure lockout                     | `ManagerApprovalService` failure counter                                   | `services/permissions/ManagerApprovalService.ts` |
| Permission set management UI                 | `PermissionSetsScreen`                                                     | `screens/settings/PermissionSetsScreen.tsx`      |
| User permission set assignment               | `UsersScreen` permission set tags                                          | `screens/UsersScreen.tsx`                        |
| `MoreMenuComposer` — action-level gate       | `composeMoreMenu` → `PermissionService.can`                                | `services/navigation/MoreMenuComposer.ts`        |
| `SettingsTabComposer` — `settings:view` gate | `composeSettingsTabs` → `PermissionService.can`                            | `services/navigation/SettingsTabComposer.ts`     |
| Price override approval flow                 | `BasketContent` price tap → `ManagerApprovalService.requestApproval`       | `screens/order/BasketContent.tsx`                |
| Manual discount approval flow                | `CheckoutModal` manual discount → `ManagerApprovalService.requestApproval` | `components/CheckoutModal.tsx`                   |
| Cache invalidation on role/set change        | `PermissionService.invalidateCache(userId)`                                | `services/permissions/PermissionService.ts`      |
| `roleAccess.ts` — legacy fallback preserved  | `canAccessMoreMenuItem`, `canAccessTab`                                    | `utils/roleAccess.ts`                            |
