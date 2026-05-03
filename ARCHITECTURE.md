# RetailPOS — Technical Architecture

This document covers the full technical setup of RetailPOS for developers, DevOps, and technical leads.

---

## Technology Stack

| Layer          | Technology                                  | Version |
| -------------- | ------------------------------------------- | ------- |
| **Framework**  | React Native + Expo                         | SDK 53  |
| **Language**   | TypeScript                                  | 5.x     |
| **Navigation** | React Navigation                            | 7.x     |
| **State**      | React Context + Zustand (sync queue)        | —       |
| **Database**   | SQLite via `expo-sqlite`                    | —       |
| **Networking** | Fetch with queued retry                     | —       |
| **Desktop**    | Electron                                    | —       |
| **Styling**    | StyleSheet + custom theme system            | —       |
| **i18n**       | react-i18next + expo-localization           | —       |
| **Logging**    | Custom LoggerFactory + pluggable transports | —       |
| **Linting**    | ESLint + Prettier                           | —       |
| **Testing**    | Jest                                        | —       |

---

## Project Structure

```
retailpos/
├── App.tsx                     # Root component — providers, SafeAreaView
├── index.js                    # Expo entry point
├── app.json                    # Expo configuration
├── babel.config.js             # Babel + react-native-dotenv
├── metro.config.js             # Metro bundler config (tree shaking)
├── tsconfig.json               # TypeScript config
├── .env / .env.example         # Environment variables
│
├── assets/                     # Static images and icons
├── locales/                    # i18n translation files (en, es, fr, de)
├── types/                      # Shared TypeScript types (basket, order)
│
├── components/                 # Shared UI components
│   ├── Breadcrumb.tsx
│   ├── PinKeypad.tsx
│   ├── PinDisplay.tsx
│   ├── ProgressIndicator.tsx
│   ├── SwipeablePanel.tsx
│   └── ...
│
├── contexts/                   # React Context providers
│   ├── AuthProvider.tsx         # PIN-based auth state
│   ├── BasketProvider.tsx       # Shopping cart state
│   ├── CategoryProvider.tsx     # Category navigation state
│   ├── DataProvider.tsx         # App-wide data loading
│   ├── OnboardingProvider.tsx   # First-run wizard state
│   └── SettingsProvider.tsx     # User preferences
│
├── hooks/                      # Custom React hooks
│   ├── usePlatformServices.ts   # ★ Unified hook — all services for current platform
│   ├── useProducts.ts           # Product fetching + pagination
│   ├── useCategories.ts         # Category tree + navigation
│   ├── useSearch.ts             # Product search
│   ├── useInventory.ts          # Inventory queries + updates
│   ├── useOrders.ts             # Local order CRUD (SQLite)
│   ├── useRefund.ts             # Refund processing
│   ├── useUsers.ts              # User CRUD + PIN management
│   ├── useEcommerceSettings.ts  # Platform config persistence
│   ├── usePaymentSettings.ts    # Payment provider config
│   ├── usePrinterSettings.ts    # Printer hardware config
│   ├── useScannerSettings.ts    # Scanner hardware config
│   ├── useSyncStore.ts          # Zustand queue for offline requests
│   └── useResponsive.ts         # Tablet/phone layout detection
│
├── navigation/                 # React Navigation setup
│   ├── RootNavigator.tsx        # Auth gate (login vs main)
│   ├── MainTabNavigator.tsx     # Bottom tabs (Order, Scanner, Search, Inventory, More)
│   └── MoreNavigator.tsx        # Settings sub-screens (lazy-loaded)
│
├── screens/                    # Screen components
│   ├── LoginScreen.tsx
│   ├── OnboardingScreen.tsx     # Wizard orchestrator
│   ├── SearchScreen.tsx
│   ├── InventoryScreen.tsx
│   ├── DailyOrdersScreen.tsx
│   ├── BarcodeScannerScreen.tsx
│   ├── onboarding/              # Wizard steps (3-phase flow)
│   │   ├── PlatformSelectionStep.tsx
│   │   ├── PlatformConfigurationStep.tsx
│   │   ├── OfflineSetupStep.tsx      # Local store + category/product setup
│   │   ├── AdminUserStep.tsx
│   │   ├── PaymentProviderStep.tsx
│   │   ├── PrinterSetupStep.tsx
│   │   └── ScannerSetupStep.tsx
│   └── order/                   # Order screen sub-components
│       ├── Category.tsx
│       ├── CategoryList.tsx
│       ├── ProductGrid.tsx
│       ├── ProductCard.tsx
│       ├── BasketContent.tsx
│       └── Header.tsx
│
├── repositories/               # SQLite data access layer
│   ├── BasketRepository.ts
│   ├── OrderRepository.ts
│   ├── OrderItemRepository.ts
│   ├── SettingsRepository.ts
│   ├── KeyValueRepository.ts
│   └── UserRepository.ts
│
├── services/                   # ★ Core business logic
│   ├── platform/                # Unified service registry
│   │   ├── PlatformServiceRegistry.ts
│   │   └── index.ts
│   ├── config/                  # Runtime POS config + settings bridge
│   │   ├── POSConfigService.ts   # POSConfigService (tax, store info, currency)
│   │   └── ServiceConfigBridge.ts
│   ├── product/                 # Product domain
│   │   ├── types.ts              # UnifiedProduct types + helpers
│   │   ├── mappers.ts            # Platform → unified mappers
│   │   ├── ProductServiceInterface.ts
│   │   ├── productServiceFactory.ts
│   │   └── platforms/            # Shopify, WooCommerce, BigCommerce, etc.
│   ├── category/                # Category domain
│   │   ├── types.ts              # UnifiedCategory types + helpers
│   │   ├── mappers.ts            # Platform → unified mappers
│   │   ├── CategoryServiceInterface.ts
│   │   ├── categoryServiceFactory.ts
│   │   └── platforms/
│   ├── order/                   # Order domain
│   │   ├── OrderServiceInterface.ts
│   │   ├── orderServiceFactory.ts
│   │   └── platforms/
│   ├── inventory/               # Inventory domain
│   │   ├── InventoryServiceInterface.ts
│   │   ├── inventoryServiceFactory.ts
│   │   └── platforms/
│   ├── search/                  # Search domain
│   │   ├── searchServiceInterface.ts
│   │   ├── searchServiceFactory.ts
│   │   └── platforms/
│   ├── refund/                  # Refund domain
│   │   ├── refundServiceInterface.ts
│   │   ├── refundServiceFactory.ts
│   │   └── platforms/
│   ├── basket/                  # Shopping cart (local)
│   │   ├── BasketServiceInterface.ts
│   │   ├── BasketService.ts        # Cart CRUD only
│   │   └── basketServiceFactory.ts # Wires ServiceContainer
│   ├── checkout/                # Checkout + order queries
│   │   ├── CheckoutServiceInterface.ts
│   │   └── CheckoutService.ts
│   ├── drawer/                  # Cash drawer peripheral
│   │   ├── CashDrawerServiceInterface.ts
│   │   └── PrinterCashDrawerService.ts  # PrinterDrawerDriver + NoOpDrawerDriver
│   ├── token/                   # OAuth / API token management
│   │   ├── tokenServiceInterface.ts
│   │   └── tokenServiceFactory.ts
│   ├── sync/                    # Background data sync
│   │   ├── OrderSyncService.ts     # Platform sync with retry + backoff
│   │   ├── BackgroundSyncService.ts # Periodic sync with exponential backoff
│   │   ├── syncServiceFactory.ts
│   │   └── platforms/
│   ├── payment/                 # Payment processing
│   │   ├── paymentServiceInterface.ts
│   │   ├── paymentServiceFactory.ts
│   │   ├── mock/                 # Mock implementations
│   │   ├── stripeService.ts
│   │   ├── squareService.ts
│   │   └── worldpayService.ts
│   ├── printer/                 # Receipt printing
│   ├── scanner/                 # Barcode scanning
│   ├── queue/                   # Offline request queue
│   │   ├── QueueManager.ts
│   │   └── QueuedApiService.ts
│   ├── storage/                 # SQLite + KV storage
│   │   ├── SQLiteStorageService.ts
│   │   └── storage.ts
│   ├── logger/                  # Logging infrastructure
│   │   ├── LoggerInterface.ts      # LoggerInterface + LogTransport + LogEntry
│   │   ├── loggerFactory.ts        # Singleton with transport management
│   │   └── ReactNativeLogger.ts    # Default logger with multi-transport forwarding
│   └── secrets/                 # Secure credential storage
│
├── models/                     # Backward-compat re-exports (→ services/*/types.ts)
│   └── index.ts
│
├── utils/
│   ├── platforms.ts             # ECommercePlatform enum + helpers
│   ├── theme.ts                 # Colors, spacing, typography, elevation
│   ├── electron.ts              # Electron bridge utilities
│   └── ...
│
└── electron/                   # Desktop shell
    └── main.js                  # Electron main process
```

---

## Design Patterns

### PlatformServiceRegistry (Unified Service Layer)

The central singleton that resolves all domain services for any `ECommercePlatform`:

```
PlatformServiceRegistry.getInstance().getServices(platform)
  → { product, category, order, inventory, search, refund, basket, token }
```

Each domain follows the same pattern:

1. **Interface** — contract (e.g. `ProductServiceInterface`)
2. **Factory** — singleton that creates/caches platform-specific implementations
3. **Platform services** — one per e-commerce platform (Shopify, WooCommerce, etc.)
4. **Offline service** — fallback implementation using local SQLite
5. **Composite service** — aggregates multiple platforms when needed

The `usePlatformServices()` hook reads the current platform from settings and returns all services at once.

### Factory Pattern

Every service domain uses a singleton factory:

```typescript
ProductServiceFactory.getInstance().getService(platform); // → ProductServiceInterface
CategoryServiceFactory.getInstance().getService(platform); // → CategoryServiceInterface
OrderServiceFactory.getInstance().getService(platform); // → OrderServiceInterface
```

### Repository Pattern

Local data (orders, users) is accessed through repository classes that wrap SQLite. Each repository file exports:

1. **An interface** (same name as the file, e.g. `OrderRepository`) — the contract
2. **An `Offline` implementation** (e.g. `OfflineOrderRepository`) — SQLite-backed, used in standalone/server mode
3. **A factory function** (e.g. `getOrderRepository()`) — returns the right implementation for the current mode

```typescript
// repositories/OrderRepository.ts
export interface OrderRepository { ... }          // contract
export class OfflineOrderRepository implements OrderRepository { ... }  // SQLite
export const orderRepository = new OfflineOrderRepository();            // singleton
export function getOrderRepository(): OrderRepository { ... }           // factory

// repositories/LocalApiOrderRepository.ts
export class LocalApiOrderRepository implements OrderRepository { ... } // HTTP to server
```

The factory function checks `localApiConfig.isClient` and returns `LocalApiOrderRepository` (HTTP) or `OfflineOrderRepository` (SQLite). Services receive the interface type — they have no knowledge of which implementation is active.

`BasketServiceFactory.buildContainer()` calls `getOrderRepository()` and `getReturnRepository()` to wire the right implementations at startup.

### Offline Queue

Write operations (POST/PUT/DELETE) are queued via `QueuedApiService` and persisted in Zustand with SQLite-backed storage. `QueueManager` processes the queue when the network is available.

### ServiceConfigBridge

Connects user-entered settings (from the onboarding wizard or settings screen) to the service factories. When a user saves their Shopify credentials, `ServiceConfigBridge` configures every factory with the correct API keys and URLs.

Factory imports are lazy-loaded (`require()`) inside methods to avoid circular dependencies.

---

## Onboarding Flow

### Online Mode

```
Welcome → Platform Selection → API Configuration → Payment → Printer → Scanner → POS Config → Admin User → Summary
```

### Offline Mode

```
Welcome → Platform Selection → Store Setup → Admin User → Staff Setup → Payment → Printer → Scanner → POS Config → Summary
```

The **POS Config** step collects store name, tax rate, currency, and other operational settings. These are persisted via `POSConfigService` and can be edited later in Settings → POS Config.

The key difference: offline mode lets the user create their product catalogue and staff accounts directly on the device, while online mode pulls data from the connected e-commerce platform.

---

## Data Models

Product and category types live alongside their services:

| Canonical location             | What                                                                        |
| ------------------------------ | --------------------------------------------------------------------------- |
| `services/product/types.ts`    | `UnifiedProduct`, `UnifiedProductVariant`, `UnifiedProductSummary`, helpers |
| `services/product/mappers.ts`  | Platform → `UnifiedProduct` mappers                                         |
| `services/category/types.ts`   | `UnifiedCategory`, `UnifiedCategoryTree`, `UnifiedCategorySummary`, helpers |
| `services/category/mappers.ts` | Platform → `UnifiedCategory` mappers                                        |
| `models/index.ts`              | Backward-compatible re-exports                                              |

All platform-specific API responses are mapped to unified types before reaching the UI.

---

## Supported Platforms

Defined in `utils/platforms.ts` via the `ECommercePlatform` enum:

- `SHOPIFY`
- `WOOCOMMERCE`
- `BIGCOMMERCE`
- `MAGENTO`
- `SYLIUS`
- `WIX`
- `PRESTASHOP`
- `SQUARESPACE`
- `OFFLINE`

---

## Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

### Mock Service Flags

Set to `true` for development (no real API calls), `false` for production:

```
USE_MOCK_SCANNER=true
USE_MOCK_PAYMENT=true
USE_MOCK_SECRETS=true
USE_MOCK_PRINTERS=true
```

### Platform API Keys

Each platform has its own set of environment variables. See `.env.example` for the full list.

---

## Development Setup

### Prerequisites

- **Node.js** 20.x+
- **Yarn** 1.x
- **Expo CLI**: `npm install -g @expo/cli`
- **Xcode** (macOS, for iOS development)
- **Android Studio** (for Android development)

### Commands

```bash
yarn install          # Install dependencies
yarn start            # Start Metro bundler
yarn ios              # Run on iOS simulator
yarn android          # Run on Android emulator
yarn web              # Run in browser
yarn desktop          # Run Electron app

yarn test             # Run Jest tests
yarn lint             # ESLint check
yarn lint:fix         # Auto-fix lint issues
yarn format           # Prettier formatting

yarn desktop:build      # Build desktop app
yarn desktop:build-mac  # macOS .dmg
yarn desktop:build-win  # Windows .exe
yarn desktop:build-linux # Linux .AppImage
```

---

## User Roles

Defined in `repositories/UserRepository.ts`:

| Role    | Value     | Capabilities                                    |
| ------- | --------- | ----------------------------------------------- |
| Admin   | `admin`   | Full access — settings, users, reports, refunds |
| Manager | `manager` | Products, reports, refunds, daily operations    |
| Cashier | `cashier` | Sales, product search, basic operations         |

Users authenticate with a 6-digit PIN stored as a hash in SQLite.

---

## Database Schema

SQLite database managed by `SQLiteStorageService`. Key tables:

- **users** — id, name, email, pin (hashed), role, is_active, timestamps
- **orders** — id, total, status, payment details, timestamps
- **order_items** — id, order_id (FK), product details, quantity, price
- **baskets** — id, items (JSON), subtotal, tax, total, timestamps
- **key_value_store** — unified key-value storage for settings, config (`pos.*` keys), sync state, cached data

`SettingsRepository` is a typed JSON facade over `KeyValueRepository` — both use the same `key_value_store` table. The legacy `settings` table is migrated and dropped in DB schema v2.

Schema versioning is handled by the storage service with automatic migrations.

---

## Service Architecture: Basket → Checkout → Sync

The original monolithic `BasketService` has been split into three focused services with constructor injection:

| Service              | Responsibility                                  | File                                   |
| -------------------- | ----------------------------------------------- | -------------------------------------- |
| **BasketService**    | Cart CRUD (add/remove/update items, totals)     | `services/basket/BasketService.ts`     |
| **CheckoutService**  | Start checkout, complete payment, order queries | `services/checkout/CheckoutService.ts` |
| **OrderSyncService** | Sync paid orders to e-commerce platforms        | `services/sync/OrderSyncService.ts`    |

`basketServiceFactory.ts` wires all three into a `ServiceContainer` and exposes `getServiceContainer()`.

### Checkout + Cash Drawer Flow

`CheckoutService.completePayment()` returns `CheckoutResult` with an `openDrawer?: boolean` flag. The service sets it to `true` when `paymentMethod === 'cash'` and `posConfig.values.drawerOpenOnCash` is enabled. The **UI** reads this flag and calls the drawer service — the service decides _if_, the UI _does_.

---

## POS Configuration

`POSConfigService` (`services/config/POSConfigService.ts`) — a singleton backed by `SettingsRepository`:

- **No built-in defaults** — all values must be set during onboarding
- `posConfig.load()` called at app startup in `App.tsx`
- `posConfig.update(field, value)` persists to the settings DB immediately
- `posConfig.values` — synchronous read of current config
- `posConfig.isConfigured` — true only when all required fields are set

**Config fields:** `taxRate`, `maxSyncRetries`, `storeName`, `storeAddress`, `storePhone`, `currencySymbol`, `drawerOpenOnCash`

POS configuration setup is deferred to More → Settings after onboarding. After onboarding, the **POS Config** tab in Settings allows editing.

---

## Logging

`LoggerFactory` provides structured logging with pluggable transports:

```typescript
const logger = LoggerFactory.getInstance().createLogger('MyComponent');
logger.info({ message: 'Operation completed' });
logger.error({ message: 'Something failed' }, error);

// Add external transport (Sentry, Datadog, New Relic)
LoggerFactory.getInstance().addTransport({
  name: 'SentryTransport',
  minLevel: LogLevel.ERROR,
  log: entry => Sentry.captureException(entry.error ?? entry.message),
});
```

Log levels: `debug`, `info`, `warn`, `error`. Transports implement the `LogTransport` interface and receive structured `LogEntry` objects. Child loggers share their parent's transports.

---

## Peripheral Services

### Cash Drawer

`CashDrawerServiceInterface` — standalone peripheral (not coupled to the printer):

- `PrinterDrawerDriver` — ESC/POS drawer-kick via receipt printer
- `NoOpDrawerDriver` — no-op when no drawer is configured
- `DrawerDriverType`: `'printer' | 'usb' | 'bluetooth' | 'network' | 'none'`

### Scanner

Optional `onDisconnect()` / `offDisconnect()` callbacks for handling unexpected disconnections.

### Payment

`PaymentServiceInterface.disconnect()` is `Promise<void> | void` (async-compatible).

### Printer

`openDrawer(pin?: 2 | 5)` on `BasePrinterService` with ESC/POS drawer kick commands. Subclasses override `sendBytes()` for raw byte writing.

---

## Background Sync

- **OrderSyncService** — per-order retry count, `MAX_SYNC_RETRIES()` enforcement, `isRetryable()`
- **BackgroundSyncService** — exponential backoff (`base × 2^failures`, capped at 15 min), pauses when app is backgrounded, resumes on foreground

---

## Internationalization

Uses `react-i18next` with `expo-localization` for automatic locale detection.

Translation files: `locales/en.json`, `locales/es.json`, `locales/fr.json`, `locales/de.json`.

---

## Security

- **Credentials** — API keys stored via `SecretsService` (react-native-keychain in production, in-memory mock for development)
- **Environment** — Sensitive values in `.env` (gitignored), never committed
- **Auth** — PIN-based with hashed storage
- **Payments** — Delegated to PCI-compliant SDKs (Stripe, Square, Worldpay)
- **Offline queue** — Persisted locally, processed only when online

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Follow TypeScript best practices and existing code style
4. Run `yarn lint` and `yarn test` before committing
5. Submit a pull request

### Code Style

- ESLint + Prettier enforced
- No comments added or removed unless explicitly requested
- Imports at the top of every file
- Prefer `import type` for type-only imports to avoid circular dependencies
