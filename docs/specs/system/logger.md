# Logger – EARS Requirements

> **System**: RetailPOS – Structured Logging
> **Actor**: System, Developer
> **Date**: 2026-04-13
> **Source**: `services/logger/LoggerInterface.ts`, `services/logger/LoggerFactory.ts`, `services/logger/ReactNativeLogger.ts`, `hooks/useLogger.ts`

---

## Context

The logger provides structured, context-tagged log output across all services and components. It is built on `react-native-logs` and exposes a pluggable transport system so external observability tools (Sentry, Datadog, New Relic, etc.) can be wired in without changing call sites.

Every service and hook obtains a **child logger** scoped to its own context name (e.g. `CheckoutService`, `BasketService`). Log output is prefixed `[Context]` so log streams can be filtered by service. In production builds, console output is suppressed (`__DEV__` guard); transports remain active regardless.

### Architecture

```
LoggerFactory (singleton)
  └── ReactNativeLogger (root, context: 'App')
        ├── console output via react-native-logs (DEV only)
        ├── child loggers (per service / component)
        └── transports[] (Sentry, Datadog, etc. — plugged in at startup)
```

### Log Levels (ascending severity)

| Level   | Value     | Typical use                              |
| ------- | --------- | ---------------------------------------- |
| `DEBUG` | `'debug'` | Development tracing, component lifecycle |
| `INFO`  | `'info'`  | Normal operation milestones              |
| `WARN`  | `'warn'`  | Recoverable issues, fallback paths taken |
| `ERROR` | `'error'` | Failures that need attention             |

---

## 1. Ubiquitous Requirements

**1.1** Every log call shall include a `context` tag identifying the originating service or component (e.g. `[CheckoutService]`, `[BasketProvider]`).

**1.2** The system shall support four log levels — `debug`, `info`, `warn`, `error` — in ascending severity order. A logger configured at level `INFO` shall suppress `DEBUG` output.

**1.3** The default log level shall be `INFO`.

**1.4** Console output shall only be emitted in development builds (`__DEV__ === true`). In production, only registered transports receive log entries.

**1.5** A broken transport shall never crash the app — transport errors are silently swallowed inside `forward()`.

**1.6** Child loggers shall inherit the transport list of their parent — adding a transport to the root logger automatically covers all child loggers.

**1.7** The `LoggerFactory` singleton shall be the single entry point for obtaining loggers. Services and hooks shall never instantiate `ReactNativeLogger` directly.

---

## 2. Event-Driven Requirements

### 2.1 Creating a Logger

**2.1.1** When `LoggerFactory.getInstance().createLogger(context)` is called, the system shall return a `ReactNativeLogger` child scoped to `'App:{context}'`, sharing the root logger's transport list.

**2.1.2** When `useLogger(context)` is called from a React component, the system shall return a memoised child logger for that context. In development, it shall log `'Component mounted'` on mount and `'Component unmounted'` on unmount at `DEBUG` level.

**2.1.3** When `LoggerFactory.setLogger(customLogger)` is called, the system shall replace the root logger with the provided implementation — all subsequent `createLogger()` calls delegate to the new root.

### 2.2 Logging a Message

**2.2.1** When `logger.debug(payload)`, `logger.info(payload)`, `logger.warn(payload)`, or `logger.error(payload, error?)` is called, the system shall:

1. Format the message as `[{context}] {message}` and emit to the `react-native-logs` console transport (DEV only).
2. Forward a structured `LogEntry` (`level`, `context`, `message`, `error?`, `metadata?`, `timestamp`) to all registered transports whose `minLevel` is at or below the current level.

**2.2.2** When `payload` is a plain string, the system shall use it as the message with no additional metadata.

**2.2.3** When `payload` is a `LogPayload` object (`{ message, ...rest }`), the system shall use `message` as the log message and pass the remaining fields as metadata to both the console and transports.

**2.2.4** When `logger.error(payload, error)` is called with an `Error` instance, the system shall include `error.message` and `error.stack` in the console output and pass the `Error` object in the `LogEntry.error` field for transports.

### 2.3 Transport Management

**2.3.1** When `LoggerFactory.addTransport(transport)` is called, the system shall append the transport to the root logger's transport list. All child loggers sharing that list will immediately forward to the new transport.

**2.3.2** When `LoggerFactory.removeTransport(name)` is called, the system shall remove the transport whose `name` matches exactly.

**2.3.3** When `LoggerFactory.getTransportNames()` is called, the system shall return the names of all currently registered transports.

**2.3.4** When a `LogTransport` has a `minLevel` set, the system shall only call `transport.log(entry)` for entries at or above that level — entries below `minLevel` are silently skipped for that transport.

**2.3.5** When a `LogTransport` has no `minLevel` set, the system shall default to `DEBUG` — the transport receives all entries.

### 2.4 Log Level Control

**2.4.1** When `LoggerFactory.setGlobalLogLevel(level)` is called, the system shall update the root logger's level and the stored `defaultLevel`. New child loggers created after this call shall use the updated level.

**2.4.2** When `logger.setLevel(level)` is called on an individual logger, the system shall update that logger's severity filter — entries below the new level are suppressed for that logger only.

---

## 3. State-Driven Requirements

**3.1** While `__DEV__` is `false` (production build), the `react-native-logs` console transport shall produce no output — only registered external transports receive entries.

**3.2** While no transports are registered, `forward()` returns immediately without constructing a `LogEntry` — zero overhead for transport forwarding in the default configuration.

**3.3** While a child logger is active, it shares the parent's `transports` array by reference — adding or removing transports on the root is reflected in all children without re-creating them.

---

## 4. Optional Feature Requirements

**4.1** Where an external observability service (Sentry, Datadog, New Relic) is configured, a `LogTransport` implementation for that service can be registered via `LoggerFactory.addTransport()` at app startup — no call sites need to change.

**4.2** Where a transport only cares about errors (e.g. a crash reporter), it can set `minLevel: LogLevel.ERROR` to receive only `error`-level entries.

**4.3** Where `LoggerFactory.setLogger(customLogger)` is used in tests, a mock logger can be injected to suppress all output and assert on log calls without touching the real implementation.

---

## 5. Unwanted Behaviour / Edge Cases

**5.1** If a transport's `log()` method throws, the system shall catch the error silently and continue forwarding to remaining transports — one broken transport must not suppress others.

**5.2** If `createLogger()` is called with the same context string multiple times, the system shall return a new child logger instance each time — loggers are not cached. Callers that need a stable reference should store the result (e.g. as a class field or via `useMemo`).

**5.3** If `setGlobalLogLevel()` is called after child loggers have already been created, existing child loggers are not retroactively updated — only the root logger and future children are affected.

**5.4** If `removeTransport(name)` is called with a name that does not match any registered transport, the system shall silently do nothing.

---

## 6. Component Traceability

| Requirement (summary)                           | Component                                                              | Source File                            |
| ----------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| Four log levels defined                         | `LogLevel` enum                                                        | `services/logger/LoggerInterface.ts`   |
| Structured `LogEntry` shape                     | `LogEntry` interface                                                   | `services/logger/LoggerInterface.ts`   |
| Pluggable transport contract                    | `LogTransport` interface                                               | `services/logger/LoggerInterface.ts`   |
| Singleton factory, default `ReactNativeLogger`  | `LoggerFactory` constructor                                            | `services/logger/LoggerFactory.ts`     |
| `createLogger(context)` returns child           | `LoggerFactory.createLogger`                                           | `services/logger/LoggerFactory.ts`     |
| Global level control                            | `LoggerFactory.setGlobalLogLevel`                                      | `services/logger/LoggerFactory.ts`     |
| Transport add / remove / list                   | `LoggerFactory.addTransport`, `removeTransport`, `getTransportNames`   | `services/logger/LoggerFactory.ts`     |
| Console output via react-native-logs (DEV only) | `ReactNativeLogger` constructor (`__DEV__` + `consoleTransport`)       | `services/logger/ReactNativeLogger.ts` |
| `[Context]` prefix on all messages              | `ReactNativeLogger.debug/info/warn/error`                              | `services/logger/ReactNativeLogger.ts` |
| Error object included in output                 | `ReactNativeLogger.error` (`error.message`, `error.stack`)             | `services/logger/ReactNativeLogger.ts` |
| Forward to transports with level filter         | `ReactNativeLogger.forward`                                            | `services/logger/ReactNativeLogger.ts` |
| Child logger shares parent transports           | `ReactNativeLogger.createChild` (`child.transports = this.transports`) | `services/logger/ReactNativeLogger.ts` |
| Transport errors swallowed                      | `ReactNativeLogger.forward` (try/catch per transport)                  | `services/logger/ReactNativeLogger.ts` |
| React hook with memoised child logger           | `useLogger`                                                            | `hooks/useLogger.ts`                   |
| DEV mount/unmount debug logs                    | `useLogger` useEffect                                                  | `hooks/useLogger.ts`                   |
