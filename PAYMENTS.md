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
