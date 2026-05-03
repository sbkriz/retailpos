# Queue Manager – EARS Requirements

> **System**: RetailPOS – Sync Queue Management  
> **Actor**: System  
> **Date**: 2026-05-03  
> **Source**: `services/queue/QueueManager.ts`, `hooks/useSyncStore.ts`, `services/sync/BackgroundSyncService.ts`

---

## Context

The Queue Manager orchestrates automatic retry of failed sync operations. It monitors network connectivity, app lifecycle state, and time-based retry intervals to trigger queue processing at optimal moments. The manager is a singleton that initializes once at app startup and runs continuously in the background.

The queue itself lives in `useSyncStore` (Zustand store). The Queue Manager does not own the queue data — it only triggers `processQueue()` when conditions are favorable for retry.

### Actors

| Actor  | Role                                                                                     |
| ------ | ---------------------------------------------------------------------------------------- |
| System | Monitors network state, app state, and retry intervals; triggers queue processing        |
| User   | Indirectly benefits from automatic retry when network returns or app comes to foreground |

### Trigger Conditions

| Trigger                | Description                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Network restored       | NetInfo detects `isConnected && isInternetReachable` transition from offline to online     |
| App foregrounded       | AppState changes to `'active'` (user returns to app from background)                       |
| Retry interval elapsed | Every 30 seconds, check if any requests have `nextRetryAt <= now` and network is available |
| Manual trigger         | `queueManager.processQueue()` called explicitly (e.g. from UI button or test)              |
| Exponential backoff    | Failed requests have `nextRetryAt` set to `now + (2^retryCount * baseDelay)` by sync store |

### Key Defaults

| Field            | Default   | Source                               |
| ---------------- | --------- | ------------------------------------ |
| Retry interval   | 30,000    | `setInterval` in `QueueManager`      |
| Network check    | On-demand | `NetInfo.fetch()` before retry check |
| Exponential base | 2         | `useSyncStore` (not in QueueManager) |
| Max retries      | 5         | `useSyncStore` (not in QueueManager) |
| Initialized flag | `false`   | `QueueManager.initialized`           |

---

## 1. Ubiquitous Requirements

**1.1** The system shall maintain a singleton instance of `QueueManager` exported as `queueManager`.

**1.2** The system shall track initialization state in the `initialized` boolean flag.

**1.3** The system shall use `LoggerFactory` to create a child logger named `'QueueManager'` for all log messages.

**1.4** The system shall delegate all queue processing logic to `useSyncStore.getState().processQueue()` — the manager does not implement retry logic itself.

**1.5** The system shall check network connectivity before triggering retry-based queue processing.

**1.6** The system shall allow multiple trigger sources (network, app state, interval, manual) to coexist without conflict.

**1.7** The system shall clean up all listeners and intervals when `dispose()` is called.

**1.8** The system shall prevent re-initialization if `initialized` is already `true`.

---

## 2. Event-Driven Requirements

### 2.1 Initialization

**2.1.1** When `initialize()` is called and `initialized` is `true`, the system shall return immediately without creating new listeners.

**2.1.2** When `initialize()` is called and `initialized` is `false`, the system shall call `NetInfo.addEventListener()` to subscribe to network state changes.

**2.1.3** When the network listener is created, the system shall store the unsubscribe function in `netInfoUnsubscribe`.

**2.1.4** When `initialize()` is called, the system shall call `AppState.addEventListener('change')` to subscribe to app lifecycle changes.

**2.1.5** When the app state listener is created, the system shall store the subscription in `appStateSubscription`.

**2.1.6** When `initialize()` is called, the system shall call `setInterval()` with a 30-second interval to check for retryable requests.

**2.1.7** When the interval is created, the system shall store the interval ID in `retryIntervalId`.

**2.1.8** When all listeners and intervals are created, the system shall set `initialized` to `true`.

**2.1.9** When initialization completes, the system shall log an info message `'QueueManager initialized'`.

### 2.2 Network State Change

**2.2.1** When the network state changes and `state.isConnected` is `true` and `state.isInternetReachable` is `true`, the system shall log an info message `'Network connection restored, processing sync queue...'`.

**2.2.2** When the network connection is restored, the system shall call `useSyncStore.getState().processQueue()` to trigger immediate queue processing.

**2.2.3** When the network state changes and either `isConnected` or `isInternetReachable` is `false`, the system shall not trigger queue processing.

### 2.3 App State Change

**2.3.1** When the app state changes to `'active'`, the system shall log an info message `'App became active, processing sync queue...'`.

**2.3.2** When the app becomes active, the system shall call `useSyncStore.getState().processQueue()` to trigger immediate queue processing.

**2.3.3** When the app state changes to `'background'` or `'inactive'`, the system shall not trigger queue processing.

### 2.4 Retry Interval Tick

**2.4.1** When the 30-second interval fires, the system shall call `NetInfo.fetch()` to check current network state.

**2.4.2** When the network state is fetched and `state.isConnected` is `false` or `state.isInternetReachable` is `false`, the system shall return immediately without checking the queue.

**2.4.3** When the network state is fetched and connectivity is confirmed, the system shall call `useSyncStore.getState()` to retrieve the current queue.

**2.4.4** When the queue is retrieved, the system shall check if any request has `nextRetryAt` set and `nextRetryAt <= now`.

**2.4.5** When retryable requests are found, the system shall log a debug message `'Retryable requests found, processing...'`.

**2.4.6** When retryable requests are found, the system shall call `useSyncStore.getState().processQueue()`.

**2.4.7** When no retryable requests are found, the system shall return immediately without calling `processQueue()`.

### 2.5 Manual Trigger

**2.5.1** When `processQueue()` is called on the manager instance, the system shall call `useSyncStore.getState().processQueue()` immediately without checking network state or retry times.

### 2.6 Get Queue Status

**2.6.1** When `getQueueStatus()` is called, the system shall call `useSyncStore.getState()` to retrieve `queue` and `isProcessing`.

**2.6.2** When the state is retrieved, the system shall calculate `length` as `queue.length`.

**2.6.3** When the state is retrieved, the system shall calculate `pendingRequests` as the count of requests where `!nextRetryAt || nextRetryAt <= now`.

**2.6.4** When the state is retrieved, the system shall calculate `retryingRequests` as the count of requests where `nextRetryAt && nextRetryAt > now`.

**2.6.5** When all values are calculated, the system shall return `{ length, isProcessing, pendingRequests, retryingRequests }`.

### 2.7 Disposal

**2.7.1** When `dispose()` is called and `netInfoUnsubscribe` is not `null`, the system shall call `netInfoUnsubscribe()` to remove the network listener.

**2.7.2** When the network listener is removed, the system shall set `netInfoUnsubscribe` to `null`.

**2.7.3** When `dispose()` is called and `appStateSubscription` is not `null`, the system shall call `appStateSubscription.remove()` to remove the app state listener.

**2.7.4** When the app state listener is removed, the system shall set `appStateSubscription` to `null`.

**2.7.5** When `dispose()` is called and `retryIntervalId` is not `null`, the system shall call `clearInterval(retryIntervalId)` to stop the retry interval.

**2.7.6** When the interval is cleared, the system shall set `retryIntervalId` to `null`.

**2.7.7** When all listeners and intervals are cleaned up, the system shall set `initialized` to `false`.

**2.7.8** When disposal completes, the system shall log an info message `'QueueManager disposed'`.

---

## 3. State-Driven Requirements

**3.1** While `initialized` is `false`, the system shall not have any active listeners or intervals.

**3.2** While `initialized` is `true`, the system shall have three active subscriptions: network listener, app state listener, and retry interval.

**3.3** While the network is offline (`!isConnected || !isInternetReachable`), the retry interval shall check connectivity but shall not trigger queue processing.

**3.4** While the app is in the background or inactive, the system shall continue running the retry interval but shall not trigger queue processing on app state changes.

**3.5** While `isProcessing` is `true` in the sync store, the manager may still trigger `processQueue()` — the sync store is responsible for preventing concurrent processing.

---

## 4. Optional Feature Requirements

**4.1** Where the app is running on a platform without `NetInfo` support, the system shall throw an error during initialization — network monitoring is required.

**4.2** Where the app is running on a platform without `AppState` support, the system shall throw an error during initialization — app lifecycle monitoring is required.

**4.3** Where `processQueue()` is called manually from a UI button or test, the system shall bypass all network and retry time checks and trigger processing immediately.

---

## 5. Unwanted Behaviour / Edge Cases

### 5.1 Re-initialization

**5.1.1** If `initialize()` is called when `initialized` is already `true`, then the system shall return immediately without creating duplicate listeners or intervals.

### 5.2 Disposal Before Initialization

**5.2.1** If `dispose()` is called when `initialized` is `false`, then the system shall check each listener/interval for `null` and skip cleanup for `null` values — no error is thrown.

### 5.3 Network Listener Failure

**5.3.1** If `NetInfo.addEventListener()` throws an error during initialization, then the error shall propagate to the caller — the manager cannot function without network monitoring.

### 5.4 App State Listener Failure

**5.4.1** If `AppState.addEventListener()` throws an error during initialization, then the error shall propagate to the caller — the manager cannot function without app lifecycle monitoring.

### 5.5 Interval Callback Error

**5.5.1** If the retry interval callback throws an error (e.g. `NetInfo.fetch()` fails), then the error shall be caught and logged but the interval shall continue running — one failed check does not stop future checks.

### 5.6 Queue Processing Failure

**5.6.1** If `useSyncStore.getState().processQueue()` throws an error, then the error shall propagate to the trigger source (network listener, app state listener, interval) — the manager does not catch errors from `processQueue()`.

### 5.7 Concurrent Triggers

**5.7.1** If the network is restored and the app is foregrounded simultaneously, then both triggers shall call `processQueue()` — the sync store is responsible for preventing concurrent processing via its `isProcessing` flag.

**5.7.2** If the retry interval fires while `processQueue()` is already running from a network trigger, then the interval shall call `processQueue()` again — the sync store shall detect `isProcessing === true` and return immediately.

### 5.8 Disposal During Processing

**5.8.1** If `dispose()` is called while `processQueue()` is running, then the listeners and intervals shall be cleaned up immediately but the in-flight processing shall continue — disposal does not cancel active sync operations.

---

## 6. Complex Requirements

**6.1** When the retry interval fires and the network is online and retryable requests exist, the system shall log a debug message, call `processQueue()`, and return — the interval continues running regardless of processing outcome.

**6.2** When the network is restored while the app is in the background, the system shall trigger queue processing from the network listener but shall not trigger from the app state listener until the app is foregrounded.

**6.3** When `initialize()` is called, the system shall create all three trigger sources (network, app state, interval) atomically — if any creation fails, the error propagates and the manager remains uninitialized.

**6.4** When `dispose()` is called, the system shall clean up all three trigger sources atomically and set `initialized` to `false` — partial cleanup is not allowed.

---

## 7. Queue Manager Lifecycle Summary

### Initialization Flow

```
App startup
  → queueManager.initialize()
    → Check if initialized === true → return early if true
    → NetInfo.addEventListener(state => ...)
      → Store unsubscribe function in netInfoUnsubscribe
    → AppState.addEventListener('change', nextAppState => ...)
      → Store subscription in appStateSubscription
    → setInterval(() => { ... }, 30000)
      → Store interval ID in retryIntervalId
    → Set initialized = true
    → Log 'QueueManager initialized'
```

### Network Trigger Flow

```
Network state changes
  → NetInfo listener callback fires
    → Check if state.isConnected && state.isInternetReachable
      → If true:
        → Log 'Network connection restored, processing sync queue...'
        → useSyncStore.getState().processQueue()
      → If false:
        → Do nothing
```

### App State Trigger Flow

```
App state changes
  → AppState listener callback fires
    → Check if nextAppState === 'active'
      → If true:
        → Log 'App became active, processing sync queue...'
        → useSyncStore.getState().processQueue()
      → If false:
        → Do nothing
```

### Retry Interval Trigger Flow

```
Every 30 seconds
  → Interval callback fires
    → NetInfo.fetch()
      → Check if state.isConnected && state.isInternetReachable
        → If false: return early
        → If true:
          → useSyncStore.getState()
          → Check if any request has nextRetryAt <= now
            → If yes:
              → Log 'Retryable requests found, processing...'
              → useSyncStore.getState().processQueue()
            → If no:
              → Do nothing
```

### Manual Trigger Flow

```
UI button or test calls queueManager.processQueue()
  → useSyncStore.getState().processQueue()
    → No network check, no retry time check
```

### Disposal Flow

```
App shutdown or manager reset
  → queueManager.dispose()
    → If netInfoUnsubscribe !== null:
      → netInfoUnsubscribe()
      → Set netInfoUnsubscribe = null
    → If appStateSubscription !== null:
      → appStateSubscription.remove()
      → Set appStateSubscription = null
    → If retryIntervalId !== null:
      → clearInterval(retryIntervalId)
      → Set retryIntervalId = null
    → Set initialized = false
    → Log 'QueueManager disposed'
```

### Queue Status Query Flow

```
UI or service calls queueManager.getQueueStatus()
  → useSyncStore.getState()
    → Extract queue and isProcessing
    → Calculate length = queue.length
    → Calculate pendingRequests = queue.filter(r => !r.nextRetryAt || r.nextRetryAt <= now).length
    → Calculate retryingRequests = queue.filter(r => r.nextRetryAt && r.nextRetryAt > now).length
    → Return { length, isProcessing, pendingRequests, retryingRequests }
```

---

## 8. Component Traceability

| Requirement (summary)                        | Component / Hook / Service                                 | Source File                        |
| -------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| Singleton instance exported                  | `queueManager` constant                                    | `services/queue/QueueManager.ts`   |
| Initialization creates listeners             | `QueueManager.initialize`                                  | `services/queue/QueueManager.ts`   |
| Network listener subscribes to NetInfo       | `NetInfo.addEventListener`                                 | `services/queue/QueueManager.ts`   |
| App state listener subscribes to AppState    | `AppState.addEventListener`                                | `services/queue/QueueManager.ts`   |
| Retry interval created                       | `setInterval(() => { ... }, 30000)`                        | `services/queue/QueueManager.ts`   |
| Network restored triggers processing         | Network listener callback → `processQueue()`               | `services/queue/QueueManager.ts`   |
| App foregrounded triggers processing         | App state listener callback → `processQueue()`             | `services/queue/QueueManager.ts`   |
| Retry interval checks for retryable requests | Interval callback → `NetInfo.fetch()` → `processQueue()`   | `services/queue/QueueManager.ts`   |
| Manual trigger calls processQueue            | `QueueManager.processQueue`                                | `services/queue/QueueManager.ts`   |
| Queue status retrieved                       | `QueueManager.getQueueStatus`                              | `services/queue/QueueManager.ts`   |
| Queue processing delegated to store          | `useSyncStore.getState().processQueue()`                   | `hooks/useSyncStore.ts`            |
| Disposal cleans up listeners                 | `QueueManager.dispose`                                     | `services/queue/QueueManager.ts`   |
| Logger created                               | `LoggerFactory.getInstance().createLogger('QueueManager')` | `services/logger/LoggerFactory.ts` |

---

**Document Metadata**:

- **Author**: Kiro AI Agent
- **Date**: 2026-05-03
- **Version**: 1.0
- **Status**: Final
- **Related**: `docs/specs/sync/sync.md`, `hooks/useSyncStore.ts`, `services/sync/BackgroundSyncService.ts`
