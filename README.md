# Zyrix Backend API

> Payment Gateway Backend for MENA & Turkey — built with Node.js, Express, TypeScript, and Prisma.

---

## Overview

Zyrix is a payment gateway serving merchants in Saudi Arabia, UAE, Kuwait, Qatar, and Turkey. This backend powers:

- `zyrix.co` — merchant web portal
- Arabic mobile app (`ar`)
- Turkish mobile app (`tr`)

All clients connect to the same API at `api.zyrix.co`. The difference between apps is language and default currency only.

---

## Requirements

| Tool | Version |
|------|---------|
| Node.js | 22+ |
| PostgreSQL | 15+ |
| npm | 10+ |

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/zyrix/zyrix-backend.git
cd zyrix-backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your values:

```env
DATABASE_URL=postgresql://your_user:your_password@localhost:5432/zyrix
JWT_SECRET=generate-a-64-char-random-string-here
JWT_REFRESH_SECRET=another-64-char-random-string-here
```

> Tip: Generate secrets with `openssl rand -hex 64`

### 3. Initialize Database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database (creates tables)
npm run db:push

# Seed with test data
npm run db:seed
```

### 4. Start Development Server

```bash
npm run dev
```

Server starts at `http://localhost:3000`

Verify with:
```bash
curl http://localhost:3000/health
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Sync schema to database |
| `npm run db:migrate` | Create and run a migration |
| `npm run db:seed` | Seed test data |
| `npm run db:reset` | Reset DB and re-seed |
| `npm run db:studio` | Open Prisma Studio (GUI) |

---

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Response Format

All responses follow this structure:

```json
// Success
{
  "success": true,
  "data": { ... }
}

// Success with pagination
{
  "success": true,
  "data": [...],
  "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}

// Error
{
  "success": false,
  "error": {
    "code": "INVALID_OTP",
    "message": "The OTP code is invalid or expired"
  }
}
```

---

### Auth Endpoints

#### `POST /api/auth/send-otp`

Request a 6-digit OTP for phone login.

**Request:**
```json
{ "phone": "+905452210888" }
```

**Response (production):**
```json
{
  "success": true,
  "data": {
    "message": "OTP sent successfully",
    "expiresIn": 300
  }
}
```

**Response (development):**
```json
{
  "success": true,
  "data": {
    "message": "OTP sent successfully",
    "expiresIn": 300,
    "devCode": "481920"
  }
}
```

> Rate limit: 5 requests per 15 minutes per IP+phone

---

#### `POST /api/auth/verify-otp`

Verify the OTP and receive access tokens.

**Request:**
```json
{
  "phone": "+905452210888",
  "code": "481920"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "name": "Mehmet Fatih",
      "phone": "+905452210888",
      "email": "info@zyrix.co",
      "merchantId": "ZRX-10042",
      "language": "tr",
      "onboardingDone": true,
      "kycStatus": "VERIFIED"
    }
  }
}
```

> Rate limit: 5 requests per 15 minutes per IP+phone

---

#### `POST /api/auth/refresh-token`

Exchange a refresh token for a new access token.

**Headers:**
```
Authorization: Bearer <refresh-token>
```

**Response:**
```json
{
  "success": true,
  "data": { "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
}
```

---

#### `POST /api/auth/logout`

Invalidate current session (client should discard tokens).

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response:**
```json
{
  "success": true,
  "data": { "message": "Logged out successfully" }
}
```

---

#### `DELETE /api/auth/account`

Permanently delete merchant account and all associated data.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response:**
```json
{
  "success": true,
  "data": { "message": "Account deleted successfully" }
}
```

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_OTP` | 400 | OTP code is wrong |
| `OTP_EXPIRED` | 400 | OTP has passed its 5-minute window |
| `OTP_MAX_ATTEMPTS` | 400 | More than 5 failed attempts |
| `INVALID_TOKEN` | 401 | JWT token is invalid |
| `TOKEN_EXPIRED` | 401 | JWT token has expired |
| `UNAUTHORIZED` | 401 | Missing or malformed Authorization header |
| `MERCHANT_SUSPENDED` | 403 | Merchant account is suspended |
| `MERCHANT_NOT_FOUND` | 401 | Merchant no longer exists |
| `VALIDATION_ERROR` | 400 | Request body failed Zod validation |
| `NOT_FOUND` | 404 | Route does not exist |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Project Structure

```
zyrix-backend/
├── prisma/
│   ├── schema.prisma          # All database tables and enums
│   └── seed.ts                # Test data seeder
├── src/
│   ├── index.ts               # Express server bootstrap
│   ├── config/
│   │   ├── database.ts        # Prisma client singleton
│   │   ├── env.ts             # Zod-validated environment config
│   │   └── cors.ts            # CORS options
│   ├── middleware/
│   │   ├── auth.ts            # JWT verification, attaches req.merchant
│   │   ├── rateLimiter.ts     # Global (100/15min) + Auth (5/15min)
│   │   ├── errorHandler.ts    # Global error handler + 404 handler
│   │   └── validator.ts       # Zod body validation factory
│   ├── routes/
│   │   └── auth.ts            # Auth route definitions + Zod schemas
│   ├── controllers/
│   │   └── authController.ts  # Auth business logic
│   ├── services/
│   │   ├── otpService.ts      # OTP create/verify with bcrypt
│   │   └── tokenService.ts    # JWT sign/verify helpers
│   └── types/
│       └── index.ts           # TypeScript interfaces and error codes
├── .env.example               # Environment variable template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## Seed Test Account

After running `npm run db:seed`, the following test merchant is available:

| Field | Value |
|-------|-------|
| Phone | `+905452210888` |
| MerchantId | `ZRX-10042` |
| Email | `info@zyrix.co` |
| Status | `ACTIVE` |
| KYC | `VERIFIED` |

To login in development:
1. `POST /api/auth/send-otp` with `{ "phone": "+905452210888" }`
2. Copy `devCode` from response
3. `POST /api/auth/verify-otp` with phone + code

---

## Database Schema

10 tables covering full payment gateway domain:

| Table | Purpose |
|-------|---------|
| `merchants` | Merchant accounts and settings |
| `transactions` | Payment records |
| `settlements` | Bank payouts |
| `disputes` | Chargeback/dispute cases |
| `invoices` | Merchant-issued invoices |
| `expenses` | Business expense tracking |
| `revenue_goals` | Revenue targets with periods |
| `subscriptions` | Zyrix plan subscriptions |
| `payment_links` | Shareable payment URLs |
| `notifications` | In-app notifications |
| `otp_codes` | Phone verification codes |

---

## Technical Decisions

- **OTP hashed with bcrypt** — OTP codes are never stored in plaintext
- **JWT stateless** — No server-side session storage needed; refresh tokens enable long sessions
- **Prisma Cascade deletes** — Deleting a merchant removes all related data automatically
- **Zod for env validation** — Server fails at startup if required env vars are missing or malformed
- **Rate limiting by IP+phone** — Prevents brute-force OTP guessing from distributed IPs
- **TypeScript strict mode** — Zero `any` types, full compile-time safety

---

## Next Steps (Chat 2 & 3)

- Transactions API (list, filter, export)
- Settlements API
- Disputes API
- Invoices & Expenses API
- Dashboard analytics endpoints
- Notifications API
- Payment Links API
- Merchant profile & settings
