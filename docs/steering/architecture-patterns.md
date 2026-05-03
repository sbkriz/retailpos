# Architecture Patterns — RetailPOS

> Canonical implementation patterns for services, repositories, hooks, and contexts. When adding new code, match the closest existing pattern exactly. See `docs/adr/` for the decisions behind each pattern.

---

## Service Layer Pattern (ADR-005)

Every platform-integrating domain follows the same four-layer structure:

```
services/[domain]/
├── [Domain]ServiceInterface.ts          # Contract — what the domain can do
├── [domain]ServiceFactory.ts            # Singleton factory — resolves implementation
└── platforms/
    ├── Base[Domain]Service.ts           # Shared base class (optional)
    ├── Platform[Domain]ServiceInterface.ts  # Platform-specific extension (optional)
    ├── Shopify[Domain]Service.ts
    ├── WooCommerce[Domain]Service.ts
    ├── Offline[Domain]Service.ts        # Always present — SQLite / local fallback
    └── ...
```

### Interface

```typescript
// services/product/ProductServiceInterface.ts
export interface ProductServiceInterface {
  getProducts(options: ProductQueryOptions): Promise<ProductResult>;
  searchProducts(query: string, options?: SearchOptions): Promise<ProductResult>;
}
```

### Factory

```typescript
// services/product/productServiceFactory.ts
export class ProductServiceFactory {
  private static instance: ProductServiceFactory;
  private services = new Map<ECommercePlatform, ProductServiceInterface>();

  public static getInstance(): ProductServiceFactory {
    if (!ProductServiceFactory.instance) {
      ProductServiceFactory.instance = new ProductServiceFactory();
    }
    return ProductServiceFactory.instance;
  }

  public getService(platform: ECommercePlatform = ECommercePlatform.OFFLINE): ProductServiceInterface {
    if (!this.services.has(platform)) {
      this.services.set(platform, this.create(platform));
    }
    return this.services.get(platform)!;
  }

  private create(platform: ECommercePlatform): ProductServiceInterface {
    switch (platform) {
      case ECommercePlatform.SHOPIFY:
        return new ShopifyProductService();
      case ECommercePlatform.WOOCOMMERCE:
        return new WooCommerceProductService();
      default:
        return new OfflineProductService();
    }
  }
}
```

### Usage in a hook

```typescript
const service = ProductServiceFactory.getInstance().getService(platform);
const result = await service.getProducts({ page: 1, limit: 100 });
```

**Key rules:**

- Factories cache instances — never `new XService()` outside a factory.
- The `offline` implementation is always the `default` branch and the universal fallback.
- Hooks and UI components call factories — they never import platform implementations directly.

---

## Repository Pattern (ADR-002, ADR-003)

Repositories own all SQLite access. Services never touch the database directly.

```typescript
// repositories/OrderRepository.ts

// 1. Interface — the contract
export interface OrderRepository {
  create(order: CreateOrderInput): Promise<string>;
  findById(id: string): Promise<LocalOrder | null>;
  findAll(): Promise<LocalOrder[]>;
  update(id: string, data: Partial<LocalOrder>): Promise<void>;
  delete(id: string): Promise<boolean>;
}

// 2. SQLite implementation — standalone / server mode
export class OfflineOrderRepository implements OrderRepository {
  private db = sqliteStorage.getDatabase();

  async create(order: CreateOrderInput): Promise<string> {
    const id = generateUUID();
    await this.db.runAsync(
      `INSERT INTO orders (id, total, status, ...) VALUES (?, ?, ...)`,
      [id, order.total, order.status, ...]
    );
    return id;
  }

  async findById(id: string): Promise<LocalOrder | null> {
    const row = await this.db.getFirstAsync<OrderRow>(
      'SELECT * FROM orders WHERE id = ?', [id]
    );
    return row ? rowToOrder(row) : null;
  }
  // ...
}

// 3. Singleton (standalone / server mode)
export const orderRepository = new OfflineOrderRepository();

// 4. Factory function — mode-aware routing
export function getOrderRepository(): OrderRepository {
  return localApiConfig.isClient
    ? new LocalApiOrderRepository()   // HTTP to server register
    : orderRepository;                // local SQLite
}
```

**Key rules:**

- The interface takes the plain noun (`OrderRepository`), not `IOrderRepository`.
- The SQLite class is `Offline[Entity]Repository`; the HTTP class is `LocalApi[Entity]Repository`.
- Services receive the interface type — they have no knowledge of which implementation is active.
- `BasketServiceFactory.buildContainer()` calls all `get[Entity]Repository()` factories at startup.

---

## Context Provider Pattern

React Contexts provide global state and expose service singletons to UI.

```typescript
// contexts/BasketProvider.tsx
export interface BasketContextType {
  basket: Basket | null;
  isLoading: boolean;
  error: string | null;
  addToCart: (product: CartProduct, qty?: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
}

const BasketContext = createContext<BasketContextType | undefined>(undefined);

export const BasketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [basket, setBasket] = useState<Basket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const value = useMemo(
    () => ({ basket, isLoading, error, addToCart, removeItem }),
    [basket, isLoading, error]
  );

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
};

// Named export — never export default for providers
export const useBasketContext = (): BasketContextType => {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error('useBasketContext must be used within BasketProvider');
  return ctx;
};
```

**Key rules:**

- Providers are named exports (`export const XProvider`), not default exports.
- The companion hook (`export const useX`) throws if used outside the provider boundary.
- Context values are memoised with `useMemo` — never recreate the object inline in the JSX.

---

## Custom Hook Pattern

Hooks encapsulate all data fetching, state management, and service calls for a domain.

```typescript
// hooks/useProducts.ts
interface UseProductsReturn {
  products: UnifiedProduct[];
  isLoading: boolean;
  error: string | null;
  fetchProducts: (options?: ProductQueryOptions) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useProducts = (platform?: ECommercePlatform): UseProductsReturn => {
  const logger = useLogger('useProducts');
  const [products, setProducts] = useState<UnifiedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(
    async (options?: ProductQueryOptions) => {
      setIsLoading(true);
      setError(null);
      try {
        const service = ProductServiceFactory.getInstance().getService(platform);
        const result = await service.getProducts(options ?? {});
        setProducts(mapToUnifiedProducts(result.products));
      } catch (err) {
        logger.error({ message: 'Failed to fetch products' }, err instanceof Error ? err : new Error(String(err)));
        setError(err instanceof Error ? err.message : 'Failed to fetch products');
      } finally {
        setIsLoading(false);
      }
    },
    [platform]
  );

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, isLoading, error, fetchProducts, refresh: fetchProducts };
};
```

**Key rules:**

- Always `export const useX = ()` — never `export default`.
- State loading flag is always `isLoading` (not `loading`).
- Errors go through `logger.error()` — never `console.error`.
- Wrap effects' subscriptions in cleanup functions.

---

## ServiceConfigBridge

`ServiceConfigBridge` (`services/config/ServiceConfigBridge.ts`) connects user-entered credentials to service factories. It is the **only** place where factory `configure(platform, config)` calls happen.

Called once after onboarding completes and again whenever credentials change in Settings.

```
ServiceConfigBridge.configureServicesForPlatform(settings)
  → ProductServiceFactory.configureService(platform, apiConfig)
  → OrderServiceFactory.configureService(platform, apiConfig)
  → TaxServiceFactory.configureService(platform, apiConfig)
  → ... (all domain factories)
```

Factory imports inside `ServiceConfigBridge` are **lazy** (`require()`) to break circular dependencies.

---

## Basket → Checkout → Sync Split (ADR-001)

Three focused services own the sale lifecycle — no monolith:

| Service            | Owns                                                       |
| ------------------ | ---------------------------------------------------------- |
| `BasketService`    | Cart CRUD: add / remove / update items, recalculate totals |
| `CheckoutService`  | `startCheckout()`, `completePayment()`, order queries      |
| `OrderSyncService` | Sync paid orders to platform, retry logic                  |

`BasketService` never creates orders. `CheckoutService` never modifies basket internals. `OrderSyncService` never touches the basket.

Wired together by `basketServiceFactory.buildContainer()` → `ServiceContainer`.

---

## Tax Strategy Pattern

Platform-specific tax is implemented via the strategy pattern (`services/tax/`):

```
TaxServiceFactory (singleton)
  └── getService(platform) → TaxServiceInterface
        ├── ShopifyTaxStrategy
        ├── WooCommerceTaxStrategy
        ├── OfflineTaxStrategy
        └── ... (one per platform)
```

Every strategy extends `BaseTaxStrategy`, which provides the five-step rate resolution pipeline:

1. Normalise tax code
2. Exempt fast-path
3. Live platform rate (`fetchPlatformRate()`)
4. Local profile fallback
5. Default profile fallback

See `docs/steering/ubiquitous-language.md §5` for full tax terminology.

---

## Background Sync

```
completePayment()
  └── OrderSyncService.syncOrderToPlatform()   ← non-blocking, best-effort
        └── on failure: retry count++, exponential backoff

BackgroundSyncService (periodic)
  └── re-runs sync for all orders in pending / failed sync status
  └── backoff: base × 2^failures, capped at 15 min
  └── pauses when app is backgrounded, resumes on foreground (AppState)
```

Retry eligibility: network errors + HTTP 5xx are retryable; HTTP 4xx are not.

---

## Background Jobs — AppState + Persisted Timestamp Pattern

> **There is no cron in a mobile app.** The OS suspends the process when the app is backgrounded. `setInterval` stops firing. Any job that needs to run "periodically" must use the `AppState` foreground-event pattern instead.

### The pattern

1. `start()` — subscribes to `AppState.addEventListener('change', ...)`. On every `'active'` transition, calls `runIfDue()`.
2. `runIfDue()` — reads a persisted timestamp from `KeyValueRepository`. If less than `minIntervalMs` has elapsed since the last successful run, it returns immediately.
3. `run()` — executes the work, persists the current timestamp on success, is also callable manually (e.g. from a Settings screen).
4. `stop()` — removes the `AppState` subscription.

```typescript
const LAST_RUN_KEY = 'myJob:lastRun';
const INTERVAL_MS  = 24 * 60 * 60 * 1000; // 24 hours

start(): void {
  this.appStateSubscription = AppState.addEventListener('change', state => {
    if (state === 'active') this.runIfDue().catch(...);
  });
  this.runIfDue(); // also check immediately on start
}

async runIfDue(): Promise<void> {
  const raw     = await this.kv.getItem(LAST_RUN_KEY);
  const lastRun = raw ? parseInt(raw, 10) : 0;
  if (Date.now() - lastRun < INTERVAL_MS) return;
  await this.run();
}

async run(): Promise<void> {
  // ... do work ...
  await this.kv.setItem(LAST_RUN_KEY, Date.now().toString()); // persist on success
}
```

### Rules

- **Never use `setInterval` or `setTimeout` for daily/periodic tasks.** These are unreliable on mobile and stop when the app is backgrounded.
- **Never reference cron syntax** (`'0 2 * * *'`) — there is no cron runtime.
- Persist `lastRun` only on **success** — a failed run should be retried on the next foreground event.
- `run()` must be idempotent and guarded against concurrent execution (`executing` flag).
- Call `start()` once at app startup (alongside `backgroundSyncService.start()` in `App.tsx`).
- `run()` may also be called directly from a Settings screen for a manual trigger.

### Existing implementations

| Class                   | Key                                        | Default interval     |
| ----------------------- | ------------------------------------------ | -------------------- |
| `BackgroundSyncService` | _(in-memory only — runs every foreground)_ | 5 min base + backoff |
| `LoyaltyExpiryJob`      | `loyalty:lastExpiryRun`                    | 24 hours             |

---

## Logger Injection

All services receive a logger via constructor or `LoggerFactory`:

```typescript
// Via LoggerFactory (singletons and non-injected services)
const logger = LoggerFactory.getInstance().createLogger('BasketService');

// Structured log entries — always include a message field
logger.info({ message: 'Item added to basket', productId, quantity });
logger.error({ message: 'Failed to sync order' }, error);
```

Add external transports (Sentry, Datadog) once via `LoggerFactory.getInstance().addTransport(...)` at app startup — child loggers inherit all transports automatically.
