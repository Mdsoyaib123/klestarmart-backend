# KlestarMart API

Express 5 + MongoDB (Mongoose) API for the KlestarMart storefront (`frontend/`) and admin dashboard (`dashboard/`).

## Getting started

```bash
cp .env.example .env     # fill in MONGODB_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npm run seed             # first admin, site settings, sample catalogue (safe to re-run)
npm run dev              # http://localhost:5050
```

Settings are validated at startup; a missing or malformed value stops the server with a list of what to fix.

| Command             | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Start with reload on change                                  |
| `npm run build`     | Compile to `dist/`                                           |
| `npm start`         | Run the compiled build                                       |
| `npm test`          | Run the test suite against a throwaway in-memory MongoDB     |
| `npm run typecheck` | Type-check the source and the tests                          |
| `npm run seed`      | Prepare a database (add `-- --no-catalog` to skip products)  |

## Responses

Every success:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 57, "pages": 3 } }
```

`meta` appears on paginated lists (`?page=&limit=`, limit at most 100).

Every error:

```json
{
  "success": false,
  "code": "OUT_OF_STOCK",
  "message": "Only 1 of \"Cotton Tee\" left in stock.",
  "errors": [{ "field": "items.0.quantity", "message": "..." }],
  "details": { "items": [{ "productId": "...", "name": "Cotton Tee", "requested": 3, "available": 1 }] },
  "requestId": "4f9c2a1e-..."
}
```

- `code` is stable; branch on it. `message` is written for people and can change.
- `errors` lists field problems for forms (validation, duplicates).
- `details` carries data the client can act on.
- `requestId` is also sent as the `X-Request-Id` header and appears on every log line for that request.
  Send your own `X-Request-Id` to trace a request across systems.

| Status | Code                  | When                                                              |
| ------ | --------------------- | ----------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`    | Input failed validation; see `errors`                             |
| 400    | `INVALID_ID`          | A malformed id in the URL                                         |
| 400    | `INVALID_JSON`        | The body is not valid JSON                                        |
| 400    | `UNSUPPORTED_FILE`    | Not a JPG, PNG, WebP, GIF or AVIF, or the content does not match  |
| 401    | `UNAUTHORIZED`        | Not signed in, or the session ended                               |
| 401    | `INVALID_CREDENTIALS` | Wrong login details                                               |
| 403    | `FORBIDDEN`           | Signed in, but not allowed                                        |
| 403    | `ACCOUNT_SUSPENDED`   | The account or phone number is blocked                            |
| 403    | `FORBIDDEN_ORIGIN`    | A write from a website other than the storefront or dashboard     |
| 404    | `NOT_FOUND`           | The record does not exist                                         |
| 404    | `ROUTE_NOT_FOUND`     | No such endpoint                                                  |
| 409    | `DUPLICATE`           | A unique value (SKU, email, phone, slug) is taken                 |
| 409    | `CONFLICT`            | The action conflicts with the data (e.g. deleting a used category)|
| 409    | `EDIT_CONFLICT`       | Someone else changed the record at the same moment; refresh       |
| 409    | `INVALID_TRANSITION`  | Order status change not allowed; `details.allowed` lists options  |
| 409    | `ITEMS_UNAVAILABLE`   | Checkout items were removed or unpublished; `details.items`       |
| 409    | `OUT_OF_STOCK`        | Not enough stock; `details.items` has what is available           |
| 413    | `PAYLOAD_TOO_LARGE`   | Body over 1 MB, or an image over 5 MB                             |
| 429    | `RATE_LIMITED`        | Too many requests; see the `Retry-After` header                   |
| 503    | `SERVICE_UNAVAILABLE` | The database is unreachable                                       |
| 500    | `INTERNAL_ERROR`      | A bug; the details are in the server log under the `requestId`    |

## Endpoints

Storefront routes are under `/api`, dashboard routes under `/api/admin`. Sessions are httpOnly cookies
(`km_customer` and `km_admin`, kept separate). Send requests with credentials.

### Storefront

| Method | Path                     | Auth      | Purpose                                              |
| ------ | ------------------------ | --------- | ---------------------------------------------------- |
| GET    | `/api/settings`          |           | Store name, logo, announcement, delivery charges     |
| GET    | `/api/categories`        |           | Visible categories                                   |
| GET    | `/api/banners`           |           | Live home page banners                               |
| GET    | `/api/products`          |           | Active products                                      |
| GET    | `/api/products/:slugOrId`|           | One active product                                   |
| POST   | `/api/orders`            | optional  | Place a cash-on-delivery order                       |
| POST   | `/api/auth/register`     |           | Create an account (claims earlier guest orders)      |
| POST   | `/api/auth/login`        |           | Sign in with phone or email                          |
| POST   | `/api/auth/logout`       |           | Sign out                                             |
| GET    | `/api/auth/me`           | customer  | Profile                                              |
| PUT    | `/api/auth/me`           | customer  | Update name and email                                |
| PUT    | `/api/auth/password`     | customer  | Change password (signs out other devices)            |
| GET    | `/api/account/orders`    | customer  | Order history                                        |

### Dashboard

| Method       | Path                                  | Auth  | Purpose                                         |
| ------------ | ------------------------------------- | ----- | ----------------------------------------------- |
| POST         | `/api/admin/auth/login`               |       | Staff sign in                                   |
| POST         | `/api/admin/auth/logout`              |       | Sign out                                        |
| GET          | `/api/admin/auth/me`                  | staff | Current user                                    |
| PUT          | `/api/admin/auth/password`            | staff | Change password (signs out other devices)       |
| GET          | `/api/admin/stats/overview?days=30`   | staff | Revenue, orders, best sellers, low stock, ...   |
| GET          | `/api/admin/stats/products/:id`       | staff | One product's sales                             |
| GET, POST    | `/api/admin/products`                 | staff | List (filters, sort, pages) / create            |
| GET, PUT, DELETE | `/api/admin/products/:id`         | staff | Read / update (stock is ignored) / delete (only if never ordered) |
| POST         | `/api/admin/products/:id/stock`       | staff | Add or remove stock `{ change }`                |
| GET, POST    | `/api/admin/categories`               | staff | List with product counts / create               |
| PUT, DELETE  | `/api/admin/categories/:id`           | staff | Update (slug changes move products) / delete    |
| GET          | `/api/admin/orders`                   | staff | List; `q, status, paymentStatus, from, to, user`|
| GET          | `/api/admin/orders/:idOrNumber`       | staff | Order with its payments                         |
| PATCH        | `/api/admin/orders/:id/status`        | staff | Move to the next status `{ status, note }`      |
| POST         | `/api/admin/orders/:id/payments`      | staff | Record a payment or refund                      |
| GET          | `/api/admin/payments`                 | staff | Payment history with totals for the filters     |
| GET          | `/api/admin/customers`                | staff | List with order count and spend                 |
| GET          | `/api/admin/customers/:id`            | staff | One customer                                    |
| PATCH        | `/api/admin/customers/:id/status`     | staff | Block or unblock                                |
| GET, POST    | `/api/admin/banners`                  | staff | List / create                                   |
| PUT, DELETE  | `/api/admin/banners/:id`              | staff | Update / delete                                 |
| POST         | `/api/admin/uploads`                  | staff | Upload an image (`file` field, 5 MB)            |
| GET          | `/api/admin/settings`                 | staff | Read settings                                   |
| PUT          | `/api/admin/settings`                 | admin | Update settings                                 |
| GET, POST    | `/api/admin/staff`                    | admin | Team list / add a member                        |
| PUT          | `/api/admin/staff/:id`                | admin | Change role, access or password                 |

`GET /health` returns 200 when the database is connected and 503 otherwise, for uptime checks and load balancers.

**Dates.** The store runs on Bangladesh time. A date such as `from=2026-10-11` means that day in Dhaka:
`from` starts at 00:00 and `to` ends at 23:59:59. Banner `startsAt`/`endsAt` work the same way.

## Behaviour worth knowing

- **Prices and delivery** are calculated on the server from the database and settings, never taken from the client.
- **Stock** is reserved with conditional updates, so two shoppers can never buy the last unit. Cancelling or
  returning an order puts the stock back exactly once, even if the button is pressed in several tabs.
- **Concurrent edits** to an order are detected (optimistic concurrency) and answered with `EDIT_CONFLICT`.
- **Stock** is set once when a product is created; after that it only changes through orders and
  `POST /products/:id/stock`, so saving a product can never undo sales made while it was open.
- **Reports** use Dhaka calendar days: "last 7 days" is today plus the six days before. Payment history
  dates a payment by when the money moved (`completedAt`), so cash collected on delivery counts on that day.
- **Customers** see their orders without staff names or internal notes from the order timeline.
- **Sessions** are checked against the database on every request: blocking a user, changing their role or
  changing a password takes effect immediately. A password change signs out every other device.
- **Security**: helmet headers, CORS limited to the two apps, a cross-site write check, rate limits
  (300 requests/minute per IP; 10 failed logins per 15 minutes; 20 orders per 15 minutes), login timing
  that does not reveal which accounts exist, image uploads checked by content, http(s)-only links.
- **Shutdown** is graceful on SIGTERM/SIGINT: open requests finish and the database closes cleanly.
- **Logs** are readable lines in development and JSON lines in production, one per request plus full
  details for every 5xx error.

## Structure

```
src/
  app.ts, server.ts       Express app; process lifecycle and graceful shutdown
  config/                 Validated environment, database connection
  lib/                    Errors, logging, dates (Dhaka), validation, pagination, passwords, responses
  middlewares/            Auth, error handler, request ids and access log, rate limits, origin check
  modules/<area>/         model, validation, service, controller and routes per area
                          (small areas keep their handlers in the routes file)
  routes/index.ts         Mounts storefront routes on /api and dashboard routes on /api/admin
  scripts/seed.ts         Database setup
tests/                    End-to-end API tests (node:test + supertest + in-memory MongoDB)
```
