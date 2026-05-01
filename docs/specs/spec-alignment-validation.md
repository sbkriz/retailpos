# Spec Alignment Validation (Pre-Phase 1)

> **Date**: 2026-04-30
> **Purpose**: Confirm capability-first specs are aligned before implementation starts.
> **Status**: PASS (CLEAN)

---

## Validation scope

- `docs/specs/platform-capability-rollout.md`
- `docs/specs/onboarding-menu-capability-implementation.md`
- `docs/specs/checkout/checkout.md`
- `docs/specs/sync/sync.md`
- `docs/specs/refunds/refunds.md`
- `docs/specs/settings/settings.md`
- `docs/specs/settings/settings-tabs.md`
- `docs/specs/onboarding/wizard.md`

---

## Checklist

| Check                                                        | Result | Evidence                                                                |
| ------------------------------------------------------------ | ------ | ----------------------------------------------------------------------- |
| Checkout no longer assumes universal draft-first             | ✅     | `checkout.md` includes `Checkout Capability Modes` + compatibility note |
| Sync no longer assumes universal `completeOrder` path        | ✅     | `sync.md` context rewritten as capability-driven                        |
| Refund support is capability-tiered                          | ✅     | `refunds.md` has `Refund Capability Matrix` + `refundMode` semantics    |
| E-commerce settings includes capability summary requirements | ✅     | `settings-tabs.md` requirements `5.3.a` / `5.3.b`                       |
| Settings model allows capability-composed tabs               | ✅     | `settings.md` updated with capability-driven tab composition            |
| Onboarding spec reflects minimal 3-phase onboarding          | ✅     | `wizard.md` has authoritative `1A` minimal onboarding requirements      |
| Architecture docs include spec-first phase gate              | ✅     | `platform-capability-rollout.md` section 13 + phase gate                |
| Onboarding/menu architecture doc has validation gate         | ✅     | `onboarding-menu-capability-implementation.md` section 13               |

---

## Cleanup confirmation

- Deprecated legacy onboarding sections were fully removed from `docs/specs/onboarding/wizard.md`.
- Checkout wording was normalized to capability-based semantics in normative requirements.
- Sync wording remains capability-driven without legacy compatibility caveats.
- Refund spec uses capability tiers directly without legacy caveats.

---

## Gate decision

- **Spec gate status:** ✅ OPEN (ready to proceed to Phase 1)
- **Condition:** implement capability model and composer services against the aligned source specs listed above.
