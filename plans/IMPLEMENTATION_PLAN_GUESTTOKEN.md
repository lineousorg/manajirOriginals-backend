# Implementation Plan: Guest Token System for Reservation Release API

## Overview
This plan breaks down the implementation of the guest token system into **3 logical parts** to solve the problem where guest users (not logged in, no phone number) cannot release their cart reservations.

## Problem Statement
- Guest users add items to cart → reservation created with `userId = -1` (anonymous)
- Guest user removes item from cart → `releaseReservation()` called
- Release fails with `400 Bad Request` because no authentication AND no guest phone
- **Result**: Guest users cannot remove items from their cart!

## Solution
Replace anonymous reservations (`userId = -1`) with a **guest token system**:
- Generate UUID v4 token for each anonymous session
- Store token in HTTP-only cookie + localStorage
- Associate reservations with `guestToken` instead of `userId = -1`
- Release reservations using the token
- Idempotent release (safe for retries)
- Indexed queries for performance

---

## Part 1: Database & DTO Layer (Foundation)

### Objective
Update the database schema and DTOs to support guest token tracking.

### Changes Required

#### 1.1 Prisma Schema (`prisma/schema.prisma`)
- Make `userId` nullable (`Int?` instead of `Int`)
- Add `guestToken String?` field
- Add `guestTokenHash String?` field (for secure indexing)
- Add index: `@@index([guestTokenHash])`

#### 1.2 DTOs (`src/stock-reservation/dto/stock-reservation.dto.ts`)
- Add `guestToken?: string` to `ReserveStockDto`
- Change `guestPhone?: string` to `guestToken?: string` in `ReleaseReservationDto`
  (Guest phone is no longer needed for release - token is used instead)

### Acceptance Criteria
- [ ] Schema compiles without errors
- [ ] Prisma Client can be generated
- [ ] DTOs validate guestToken as optional string

### Files Modified
- `prisma/schema.prisma`
- `src/stock-reservation/dto/stock-reservation.dto.ts`

### Dependencies
- None (standalone)

### Risk Level
- **LOW**: Schema changes are additive, no breaking changes to existing logic yet

---

## Part 2: Service Layer - Core Logic

### Objective
Implement the business logic for token-based reservations and releases.

### Changes Required

#### 2.1 Token Generation (`src/stock-reservation/stock-reservation.controller.ts`)
- Add `GET /stock-reservation/guest-token` endpoint
- Generates UUID v4 token on first visit
- Sets HTTP-only cookie (7 days)
- Returns token in response

#### 2.2 Reservation Creation (`src/stock-reservation/stock-reservation.service.ts`)
- Accept `guestToken` parameter in `reserveStock()`
- Validate: anonymous users MUST provide guestToken
- Store `guestToken` and `guestTokenHash` in reservation
- Set `userId = null` for anonymous reservations
- Remove `userId = -1` logic completely

#### 2.3 Release Reservation (Core Fix)
- Accept `guestToken` parameter (instead of `guestPhone`)
- XOR ownership logic:
  - If `userId` provided → match by `userId`
  - If `guestToken` provided → match by `guestToken`
  - Never match by both
- **Idempotency**: If reservation already `RELEASED`, return success
- **Race Condition Protection**: Check status before and after transaction
- Restore stock atomically
- Update status to `RELEASED`

#### 2.4 Get My Reservations
- Accept `guestToken` query parameter
- Filter by `guestToken` for anonymous users
- Filter by `userId` for authenticated users

### Acceptance Criteria
- [ ] Guest users can reserve stock with token
- [ ] Guest users can release reservations with token
- [ ] Double release returns success (idempotent)
- [ ] Authenticated users still work normally
- [ ] Stock is restored correctly on release

### Files Modified
- `src/stock-reservation/stock-reservation.controller.ts`
- `src/stock-reservation/stock-reservation.service.ts`

### Dependencies
- Part 1 (Schema & DTOs)
- `uuid` package (already in package.json)
- `crypto` (Node.js built-in)

### Risk Level
- **MEDIUM**: Core business logic changes, requires thorough testing

---

## Part 3: Integration & Cleanup

### Objective
Update supporting components and ensure end-to-end functionality.

### Changes Required

#### 3.1 Frontend Integration Guide
- Call `GET /stock-reservation/guest-token` on app load
- Store token in localStorage
- Include `guestToken` in all reservation requests
- Handle 404 gracefully (reservation already released)

#### 3.2 API Documentation (`docs/API_DOCUMENTATION.md`)
- Update `/stock-reservation/release` endpoint docs
- Document guest token flow
- Add examples for anonymous users
- Update request/response schemas

#### 3.3 Migration Strategy (Optional)
- Create migration script for existing `userId = -1` reservations
- Convert to `guestToken` system
- Or leave as-is (backward compatible)

#### 3.4 Expired Reservation Cleanup
- Update cron job to handle `guestToken`
- No changes needed (works with null userId)

#### 3.5 Testing
- Unit tests for token generation
- Unit tests for reservation creation with token
- Unit tests for idempotent release
- Integration tests for full flow

### Acceptance Criteria
- [ ] API documentation updated
- [ ] Frontend can integrate using guide
- [ ] All tests pass
- [ ] No regression in existing functionality

### Files Modified
- `docs/API_DOCUMENTATION.md`
- Test files (optional)
- Migration script (optional)

### Dependencies
- Part 1 & Part 2

### Risk Level
- **LOW**: Documentation and integration changes only

---

## Implementation Order

### Phase 1: Database (Part 1)
```bash
# 1. Update schema
# 2. Generate migration
npx prisma migrate dev --name add_guest_token

# 3. Generate Prisma client
npx prisma generate
```

### Phase 2: Service Layer (Part 2)
```bash
# 1. Update DTOs
# 2. Update controller (add guest-token endpoint)
# 3. Update service (reserve, release, getMyReservations)
# 4. Run tests
npm test
```

### Phase 3: Integration (Part 3)
```bash
# 1. Update API docs
# 2. Create frontend integration guide
# 3. Test end-to-end flow
```

---

## Key Features Delivered

### 1. Guest Token System
- ✅ UUID v4 for unguessable tokens
- ✅ HTTP-only cookie for security
- ✅ Hashed in database (SHA256)
- ✅ Indexed for performance

### 2. Proper Ownership Logic
- ✅ XOR: userId OR guestToken (never both)
- ✅ No cross-user access possible
- ✅ Secure token validation

### 3. Idempotent Release
- ✅ Double release returns success
- ✅ Safe for frontend retries
- ✅ No error on race conditions

### 4. Race Condition Protection
- ✅ Transaction-safe
- ✅ Status check before and after
- ✅ Atomic stock restoration

### 5. Performance
- ✅ Indexed queries (O(log n))
- ✅ No N+1 queries
- ✅ Minimal overhead

---

## Testing Matrix

| Scenario | Part | Test Case |
|----------|------|-----------|
| Anonymous reserve with token | Part 2 | Reserve → Success |
| Anonymous release with token | Part 2 | Release → Success |
| Double release | Part 2 | Release twice → Success both times |
| Wrong token | Part 2 | Release with wrong token → 404 |
| No token | Part 2 | Reserve without token → 400 |
| Auth'd user reserve | Part 2 | Reserve with JWT → Success |
| Auth'd user release | Part 2 | Release with JWT → Success |
| Get my reservations (guest) | Part 2 | With token → Returns reservations |
| Get my reservations (auth) | Part 2 | With JWT → Returns reservations |
| Concurrent release | Part 2 | 2x same request → One succeeds, one idempotent |
| Token generation | Part 2 | GET guest-token → Returns UUID |
| Cookie set | Part 2 | Response includes Set-Cookie header |

---

## Rollback Plan

If issues arise:

1. **Database**: Migration can be rolled back with `prisma migrate reset`
2. **Service Layer**: Old logic can be restored from git
3. **Frontend**: Token is optional in request (backward compatible)

---

## Success Metrics

- [ ] Guest users can remove cart items without phone number
- [ ] No 400 errors on cart removal
- [ ] Stock is correctly restored
- [ ] No double-release issues
- [ ] Performance < 50ms p95
- [ ] 0% error rate under load

---

## Timeline

- **Part 1**: 30 minutes (schema + migration)
- **Part 2**: 2 hours (service logic + testing)
- **Part 3**: 1 hour (docs + integration)
- **Total**: ~3.5 hours

---

## Notes

- Guest phone numbers are still supported for checkout (separate flow)
- Guest tokens are only for session tracking and cart management
- Authenticated users continue to work as before
- No breaking changes to existing APIs
- Fully backward compatible