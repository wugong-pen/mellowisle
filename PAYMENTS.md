# ECPay sandbox slice

This release supports Taiwan delivery / TWD / ECPay credit-card sandbox only. Production checkout and callbacks fail closed. Public ECPay sandbox credentials are fixed in the server module; no merchant production credentials are collected or deployed. `ecpay.js` is excluded from public assets.

Prices and nib variants are copied from the existing six product pages into a server catalog. Browser totals are ignored; the user first receives a server quote and must submit that same total. Test shipping is explicitly zero; this is not a production shipping policy.

The existing orders table is reused, requiring no schema change. New order numbers are 20 alphanumeric characters. Payment callbacks verify the MAC, merchant, amount and matching ECPay order. Repeated notifications cannot downgrade a successful payment. `SimulatePaid=1` is acknowledged without changing status. Successful sandbox card payments become `test_paid`, never `paid`. Callbacks do not decrement stock, issue gifts or trigger fulfillment.

Deploy only staging. Verify a sandbox card transaction returns to the member page and that a signed server callback changes the corresponding order to test-paid. Browser return alone is not payment proof. Use only fake member and address data. The provider's sandbox is shared and its keys are public; sandbox results are not suitable for shipping goods.

Not yet implemented: production activation, stock reservations, independent payment ledger/provider reconciliation, refunds, payment retries after provider rejection, payment timeout cancellation, LINE Pay, bank remittance, PayPal, final shipping rates. These remain prerequisites for a full live checkout release.

Official references:
- https://developers.ecpay.com.tw/2856/
- https://developers.ecpay.com.tw/2862/
- https://developers.ecpay.com.tw/2878/

## Additional payment implementation (not yet deployed)

Bank transfer: Taiwan only, TWD, immutable account snapshot and 72-hour deadline from order creation. Member-only detail and last-five-digits/date reporting. Reporting never changes the order to paid. Staging uses an unmistakably fictional account. Real account information remains outside the repository. An authenticated administrator reconciliation workflow is still required before live use.

LINE Pay: Sandbox v3 request and server confirmation, HMAC authentication, exact large transaction IDs, persisted provider ID, member ownership and state matching. Successful verified confirmation records test_paid. Missing sandbox channel credentials disables checkout.

PayPal: Sandbox Orders v2 create/approve/capture, TWD integer values, stable idempotency IDs, persisted order ID, completed-capture/order/currency/amount validation. Available for JP/KR/US/SG delivery only when sandbox credentials exist. Missing credentials disables checkout.

Apply schema-payments.sql to the isolated test D1 before deploying the Worker. Set LINEPAY_SANDBOX_CHANNEL_ID and LINEPAY_SANDBOX_CHANNEL_SECRET, PAYPAL_SANDBOX_CLIENT_ID and PAYPAL_SANDBOX_CLIENT_SECRET as Worker secrets. Never put credentials in frontend files or git. Bank test configuration is in staging variables only.

Limits: real provider transactions have not been tested. Requests with uncertain provider results intentionally block creation of another payment attempt; operational reconciliation/recovery, LINE confirmation recovery after an interrupted response, webhook reconciliation, refunds, automatic cancellation, final shipping prices, inventory integration and live activation remain incomplete. Returning to the website alone never marks an order paid. PayPal confirmation can re-query an already captured provider order. Browser return confirmation currently requires the member session.

Validation: 13 Node tests pass including the Miniflare/Cloudflare D1 runtime test. Module bundling through esbuild's API succeeds. Wrangler deploy dry-run is blocked by Windows directory traversal access; Git remote operations are blocked by an unavailable remote-https helper. No remote synchronization or deployment is claimed.

References:
- https://developers-pay.line.me/online-api-v3/request-payment
- https://developers-pay.line.me/online-api-v3/confirm-payment
- https://developer.paypal.com/api/orders/v2
- https://developer.paypal.com/api/codes/currency/
