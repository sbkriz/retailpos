# RetailPOS Payment Service

## Architecture Overview

The payment layer is a **tap-to-pay only** abstraction over React Native SDK integrations. Only providers that ship a React Native SDK for contactless (tap-to-pay) payments on mobile and tablet are supported here.

Providers without a React Native SDK must be integrated through the **Instore API** layer. The POS client calls Instore API endpoints and the Instore API handles all PED hardware communication.

### Core Components

| File                         | Role                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `PaymentServiceInterface.ts` | Shared `PaymentRequest` / `PaymentResponse` types and the interface all providers implement |
| `PaymentServiceFactory.ts`   | Singleton factory — resolves the active provider at runtime                                 |
| `PaymentService.ts`          | Singleton facade — delegates all calls to the active provider                               |
| `mock/MockPaymentService.ts` | Single mock used for all providers in Expo Go and when `USE_MOCK_PAYMENT=true`              |

### Supported Providers

| Provider        | Enum           | SDK                                    | Notes                            |
| --------------- | -------------- | -------------------------------------- | -------------------------------- |
| Stripe NFC      | `STRIPE_NFC`   | `@stripe/stripe-terminal-react-native` | NFC tap-to-pay, default provider |
| Stripe Terminal | `STRIPE`       | `@stripe/stripe-terminal-react-native` | Reader-based                     |
| Square          | `SQUARE`       | `react-native-square-in-app-payments`  | Lazy-loaded                      |
| Adyen           | `ADYEN`        | `@adyen/react-native`                  | Lazy-loaded                      |
| Tap Payments    | `TAP_PAYMENTS` | `@tap-payments/card-sdk`               | Lazy-loaded                      |

### Provider Resolution

```
PaymentServiceFactory.getPaymentService()
  → Expo Go || USE_MOCK_PAYMENT=true  → MockPaymentService
  → STRIPE_NFC                        → StripeNfcService
  → STRIPE                            → StripeService
  → SQUARE                            → SquareService   (lazy, fallback to mock on load error)
  → ADYEN                             → AdyenService    (lazy, fallback to mock on load error)
  → TAP_PAYMENTS                      → TapPaymentsService (lazy, fallback to mock on load error)
  → any other value                   → throw 'Unsupported payment provider'
```

### Mock Strategy

A single `MockPaymentService` replaces all real provider implementations when:

- Running in **Expo Go** (`Constants.appOwnership === 'expo'`), or
- `USE_MOCK_PAYMENT=true` is set in the environment.

It simulates the full lifecycle — `getAvailableTerminals`, `connectToTerminal`, `processPayment`, `disconnect` — with realistic delays and stub data.

## Usage

```tsx
import { usePayment } from '../hooks/usePayment';

const MyComponent = () => {
  const { connectToTerminal, processPayment, disconnect, isTerminalConnected } = usePayment();

  const handlePayment = async () => {
    const response = await processPayment({
      amount: 1099, // minor currency units (e.g. cents)
      reference: 'ORDER-123',
      currency: 'usd',
      orderId: 'ORD-456',
      customerName: 'Jane Doe',
    });

    if (response.success) {
      console.log('Payment successful:', response.transactionId);
    } else {
      console.error('Payment failed:', response.errorMessage);
    }
  };
};
```

## Switching Providers

```tsx
import { usePayment } from '../hooks/usePayment';
import { PaymentProvider } from '../services/payment/PaymentServiceFactory';

const { setPaymentProvider } = usePayment();

// Switch to Square at runtime (disconnects current provider first)
setPaymentProvider(PaymentProvider.SQUARE);
```

## Adding a New Provider

1. Implement `PaymentServiceInterface` in a new `<Provider>Service.ts` file.
2. Add the provider to the `PaymentProvider` enum in `PaymentServiceFactory.ts`.
3. Add a `case` in `PaymentServiceFactory.getPaymentService()` — use `loadWithMockFallback` for lazy-loaded SDKs.
4. Add provider settings to `PaymentSettings` in `hooks/usePaymentSettings.ts`.
5. Add a settings form in `screens/settings/PaymentSettingsTab.tsx` and `screens/onboarding/PaymentProviderStep.tsx`.

> **Note**: Only add providers that have a React Native SDK for tap-to-pay. All other providers must go through the Instore API.
