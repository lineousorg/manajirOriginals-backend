# Code Review Report: manajirOriginals Backend

**Date:** 2026-04-19  
**Project:** NestJS E-commerce Backend  
**Focus Areas:** Product Stock Management, Orders, Stock Reservation, Performance, Security

---

## Executive Summary

A comprehensive code review of the NestJS e-commerce backend identified **50+ issues** ranging from **critical production-breaking bugs** to performance optimizations and security vulnerabilities. The most severe issues are in the order processing and stock management logic, which could lead to **overselling, stock discrepancies, financial loss, and system crashes** under load.

**Priority:** Address the 9 critical bugs immediately before production deployment.

---

## 🚨 CRITICAL PRODUCTION-BREAKING BUGS


<!-- Fixed -->
### 1. Missing Stock Deduction in Authenticated Order Creation

**File:** `src/order/order.service.ts` (lines 189-250)  
**Severity:** CRITICAL  
**Impact:** Overselling, negative inventory, order fulfillment failures

In `OrderService.create()`, inside the transaction, there is code to handle items WITH reservations (lines 191-250), but **NO CODE** exists to handle items WITHOUT reservations. The comment on line 252 explicitly says "Issue #3: For items WITHOUT reservation: use atomic update inside transaction" but the implementation is missing. The transaction then proceeds to create the order without deducting stock for non-reservation items.

```typescript
// Line 189-250: Handles items with reservations
// Line 252: Comment says "For items WITHOUT reservation: use atomic update inside transaction"
// BUT NO CODE FOLLOWS - Order is created without stock deduction
```

**Affected Flow:** Authenticated users ordering without using the reservation system.

**Fix Required:** Add atomic stock deduction for non-reservation items inside the transaction before order creation:

```typescript
// Inside transaction, after processing reservation items:
const itemsWithoutReservation = dto.items.filter(item => !item.reservationId);
for (const item of itemsWithoutReservation) {
  const updatedVariant = await tx.productVariant.updateMany({
    where: { id: item.variantId, stock: { gte: item.quantity } },
    data: { stock: { decrement: item.quantity } },
  });
  if (updatedVariant.count === 0) {
    throw new BadRequestException(`Insufficient stock for variant ${item.variantId}`);
  }
}
```

---


<!-- Fixed -->
### 2. Race Condition in Guest Order Stock Deduction

**File:** `src/order/order.service.ts` (lines 461-474)  
**Severity:** CRITICAL  
**Impact:** Concurrent orders can bypass stock limits, causing overselling

In `createGuest()`, items without reservation are processed in a loop with a check **after** the stock decrement:

```typescript
for (const item of itemsWithoutReservation) {
  const updatedVariant = await tx.productVariant.update({
    where: { id: item.variantId },
    data: { stock: { decrement: item.quantity } },
  });
  if (updatedVariant.stock < 0) { // Check AFTER update
    throw new BadRequestException(...);
  }
}
```

Two concurrent requests for the same variant can both succeed even if combined quantity exceeds stock, because the check happens after the update and is not conditional.

**Fix Required:** Use conditional update with `stock: { gte: quantity }` check (same pattern as in `StockReservationService.reserveStock()` lines 93-99).

---

<!-- Fixed -->
### 3. Duplicate Order/Invoice Number Generation with Race Condition

**File:** `src/order/order.service.ts` (lines 29-47, 170-186)  
**Severity:** CRITICAL  
**Impact:** Duplicate order numbers under load, database constraint violations, order tracking confusion

Order numbers are generated as `yyyymmddproductId` (e.g., `202604071234`). The duplicate check is:

1. Not inside a transaction
2. Uses `findFirst()` then `count()` with `startsWith`
3. Appends suffix if duplicate found

Two concurrent orders for the same product on the same day will:
- Both generate the same base `orderNumber`
- Both pass the `findFirst` check (neither exists yet)
- Both attempt to create orders with identical `orderNumber`
- One will succeed, one will fail with unique constraint violation (if constraint exists) or both will succeed with duplicates (if no constraint)

**Additionally:** The database schema (`prisma/schema.prisma`) has **no unique constraint** on `orderNumber` or `invoiceNumber`.

**Fix Required:**
- Add `@@unique([orderNumber])` and `@@unique([invoiceNumber])` to the `Order` model in Prisma schema
- Use database sequence or UUID for order numbers, OR
- Move duplicate check and order creation into a single transaction with `SELECT ... FOR UPDATE` lock

---

<!-- Fixed (Need to make a env variable to manege it from one place) -->
### 4. Inconsistent Delivery Charges

**File:** `src/order/order.service.ts`  
- Line 163: `deliveryCharge = deliveryType === INSIDE_DHAKA ? 120 : 200` (in `create()`)  
- Line 419: `deliveryCharge = deliveryType === INSIDE_DHAKA ? 70 : 150` (in `createGuest()`)

**Severity:** CRITICAL  
**Impact:** Revenue loss, customer confusion, unfair pricing

Authenticated users pay 120/200 while guest users pay 70/150 for the same delivery zones. This is a business logic bug that could lead to significant revenue leakage if guests exploit the lower price.

**Fix Required:** Standardize delivery charges in a shared configuration (env variables or database) and use the same logic in both methods.

---

### 5. Incorrect Available Stock Calculation

**File:** `src/stock-reservation/stock-reservation.service.ts`  
- `getAvailableStock()`: lines 345-378, specifically line 367  
- `getAvailableStockBulk()`: lines 385-437, specifically line 427  
- `checkAvailability()`: lines 442-472, specifically line 462

**Severity:** CRITICAL  
**Impact:** Misleading stock information, overselling risk

The methods have inconsistent logic:

- `getAvailableStock()` returns `availableStock = variant.stock` and separately calculates `reservedStock`. The comment claims "Stock is already decremented when reservation is created", implying `variant.stock` already equals available stock. This is only true if **all** stock reductions go through the reservation system.

- `checkAvailability()` simply returns `quantity <= variant.stock` without considering active reservations at all. If 10 units are reserved (stock already decremented to 5), and a user checks availability for 5, it will return `available: true` even though there are only 5 physically available but 10 reserved. This is correct if `variant.stock` is truly available stock. But if some orders bypass reservations (bug #1), then `variant.stock` is not the true available stock.

The core issue: **Bug #1 (missing stock deduction for non-reservation orders) breaks the invariant** that `variant.stock` represents available inventory. The stock calculation becomes meaningless if some orders don't decrement stock.

**Fix Required:**
- First fix bug #1 to ensure all orders decrement stock.
- Then verify the reservation system correctly maintains `stock = physical inventory - reserved`.
- Consider adding a `reservedStock` column to `ProductVariant` to track reservations separately from physical stock, or use the current pattern consistently with proper atomic updates.

---

### 6. Stock Not Restored on Order Cancellation for Reservation Items

**File:** `src/order/order.service.ts` (lines 968-972)  
**Severity:** CRITICAL  
**Impact:** Permanent stock loss when orders with reservations are cancelled

When an order is cancelled, the code processes each order item:

```typescript
if (item.reservationId) {
  await tx.stockReservation.updateMany({
    where: { id: item.reservationId, status: 'USED' },
    data: { status: 'RELEASED', updatedAt: new Date() },
  });
  // No stock increment!
} else {
  // No reservation: restore the stock
  await tx.productVariant.update({
    where: { id: item.variantId },
    data: { stock: { increment: item.quantity } },
  });
}
```

For items with reservations, only the reservation status is changed to `RELEASED`, but the stock is **not incremented**. The stock was decremented when the reservation was created (in `reserveStock()`), and the reservation was marked `USED` during order creation (no stock change). When the order is cancelled, the stock should be restored because the items are no longer sold.

**Current Stock Flow:**
1. `reserveStock()`: stock -= quantity, reservation = ACTIVE
2. `createOrder()`: reservation.status = USED (stock unchanged)
3. `cancelOrder()`: reservation.status = RELEASED (stock NOT restored) → **LOSS**

**Fix Required:** Increment stock when changing reservation from USED to RELEASED:

```typescript
if (item.reservationId) {
  await tx.stockReservation.updateMany({...});
  await tx.productVariant.update({
    where: { id: item.variantId },
    data: { stock: { increment: item.quantity } },
  });
}
```

---

### 7. Anonymous Reservations Cannot Be Released

**File:** `src/stock-reservation/stock-reservation.service.ts`  
- Lines 52-54: `effectiveUserId = -1` for anonymous  
- Line 190: `if (effectiveUserId && effectiveUserId > 0)` filters out -1

**Severity:** CRITICAL  
**Impact:** Stock held hostage until reservation expires; poor user experience

Anonymous users (no userId, no guestPhone provided) get assigned `userId = -1`. However, `releaseReservation()` only adds the `userId` filter to the query if `effectiveUserId > 0`. This means anonymous reservations are **excluded** from the query, making them impossible to release via the API. They will eventually expire and stock will be restored by the scheduler, but that could be 15+ minutes later, during which the stock is unusable.

**Also:** `getUserReservations()` returns empty for anonymous users because the check `if (!effectiveUserId)` at line 302 treats `-1` as truthy but the logic is fragile.

**Fix Required:**
- Make `userId` column nullable in `StockReservation` (change from `Int` to `Int?`)
- Use `null` for anonymous instead of `-1`
- Update queries to handle `null` properly
- OR, allow `-1` in all queries by removing the `> 0` check

---

### 8. `createGuest()` Has Undefined `userId` Variable (ReferenceError)

**File:** `src/order/order.service.ts` (line 208)  
**Severity:** CRITICAL  
**Impact:** Method crashes when processing reservations; guest orders with reservations are completely broken

Inside the `createGuest()` transaction, the code validates reservation ownership:

```typescript
for (const item of itemsWithReservation) {
  const reservation = await tx.stockReservation.findUnique({...});
  // ...
  if (reservation.userId !== userId) { // <-- userId is NOT defined in createGuest!
    console.log(reservation.userId, userId);
    throw new BadRequestException(...);
  }
}
```

The variable `userId` does not exist in the scope of `createGuest()`. This will throw `ReferenceError: userId is not defined` whenever a guest order includes any item with a reservation. The entire method fails for reservation-based orders.

**Fix Required:** For guest orders, fetch the guest user by phone first (from DTO), then use that guest user's ID for comparison:

```typescript
// Before transaction, fetch guest user by phone
const guestUser = await this.guestUserService.findByPhone(dto.phone);
if (!guestUser) throw new BadRequestException('Guest user not found');

// Then inside transaction:
if (reservation.userId !== guestUser.id) { ... }
```

Also handle anonymous reservations (`userId = -1`) appropriately.

---

### 9. `create()` Order Does Not Deduct Stock for Non-Reservation Items

**File:** `src/order/order.service.ts` (lines 252-254)  
**Severity:** CRITICAL  
**Impact:** Same as bug #1 but for authenticated orders

After processing reservation items (lines 191-250), there is a comment indicating stock deduction should happen for non-reservation items, but **no code is present**. The transaction then creates the order (line 256) without ever decrementing stock for items that didn't have reservations.

This is a **showstopper** - authenticated users can order products without any stock reduction.

**Fix Required:** Implement the missing stock deduction logic (see fix for bug #1).

---

## 🔴 HIGH-PRIORITY ISSUES

### 10. reCAPTCHA Bypass When Secret Key Missing

**File:** `src/order/order.service.ts` (lines 64-68)  
**Severity:** HIGH  
**Impact:** Bot attacks, spam orders, system abuse

```typescript
const secretKey = process.env.RECAPTCHA_SECRET_KEY;
if (!secretKey) {
  console.warn('RECAPTCHA_SECRET_KEY not configured, skipping validation');
  return true; // ⚠️ BYPASSES SECURITY
}
```

If the environment variable is missing, reCAPTCHA validation is completely skipped with only a warning. This allows bots to flood the guest order endpoint without any challenge.

**Fix Required:** Throw an error if reCAPTCHA is enabled but secret key is missing, or make reCAPTCHA mandatory for guest orders.

---

### 11. Product Update Not Transactional

**File:** `src/product/product.service.ts` (lines 606-819)  
**Severity:** HIGH  
**Impact:** Data inconsistency if update fails partway through

The `update()` method performs multiple operations in parallel without a transaction:
- Updates images (lines 667-693)
- Updates/upserts variants (lines 714-817)
- Updates product basic fields (lines 822-849)

If an error occurs after images are updated but before variants are updated, the database is left in a partially updated state.

**Fix Required:** Wrap the entire update in `this.prisma.$transaction(async (tx) => { ... })` and use `tx` for all operations.

---

### 12. `releaseExpiredReservations()` and `forceCleanAllReservations()` Use O(N) Loop Updates

**File:** `src/stock-reservation/stock-reservation.service.ts`  
- Lines 497-519 (`releaseExpiredReservations`)  
- Lines 586-605 (`forceCleanAllReservations`)

**Severity:** MEDIUM-HIGH  
**Impact:** Performance degradation with large number of reservations; slow cron jobs

Both methods loop through each reservation and execute a separate `productVariant.update()` call:

```typescript
for (const reservation of expiredReservations) {
  await tx.productVariant.update({
    where: { id: reservation.variantId },
    data: { stock: { increment: reservation.quantity } },
  });
}
```

With thousands of expired reservations, this results in thousands of individual UPDATE queries, which is extremely slow.

**Fix Required:** Use bulk update with `UPDATE ... FROM` pattern or Prisma's `updateMany` with a CASE statement. Example:

```typescript
// Group reservations by variantId and sum quantities, then bulk update
const variantQuantities = new Map<number, number>();
for (const r of expiredReservations) {
  variantQuantities.set(r.variantId, (variantQuantities.get(r.variantId) || 0) + r.quantity);
}
// Then perform bulk update using raw query or multiple updateMany
```

---

### 13. `releaseReservation()` Authorization Bypass

**File:** `src/stock-reservation/stock-reservation.service.ts` (lines 184-196)  
**Severity:** MEDIUM-HIGH  
**Impact:** Any user can release any reservation by ID if they omit credentials

The query construction:

```typescript
const query: any = {
  id: reservationId,
  status: 'ACTIVE' as const,
};
if (effectiveUserId && effectiveUserId > 0) {
  query.userId = effectiveUserId;
}
```

If no `userId` (null) or anonymous (`-1`), the `userId` filter is **not added**. This means **any active reservation can be released by anyone** who knows the reservation ID, as long as they don't provide authentication. A malicious user could release other users' reservations, causing order failures.

**Fix Required:** Always require ownership proof:
- For authenticated users (`userId > 0`): must match `reservation.userId`
- For guest users: must provide `guestPhone` that matches the guest user linked to reservation
- For anonymous: should not be releasable via API (only via expiration)

---

### 14. `trackGuestOrder()` Exposes Orders Without Rate Limiting

**File:** `src/order/order.service.ts` (lines 552-621)  
**Severity:** MEDIUM-HIGH  
**Impact:** Information enumeration, data harvesting, privacy violation

`GET /orders/guest/track?phone=+8801...` is a public endpoint with no authentication, no rate limiting, and no CAPTCHA. Anyone can:
- Enumerate valid phone numbers
- Harvest order numbers and details
- Probe for existing customers
- Build a database of orders

**Fix Required:**
- Add rate limiting (e.g., 5 attempts per hour per IP)
- Require reCAPTCHA
- Return minimal information (only order numbers and statuses, not full details)
- Or require OTP verification via SMS

---

### 15. `downloadReceipt()` Weak Security for Guest Orders

**File:** `src/order/order.controller.ts` (lines 115-141)  
**Severity:** MEDIUM-HIGH  
**Impact:** Unauthorized receipt access, privacy breach

The endpoint allows downloading PDF receipts if you know:
- Order ID (sequential, easy to guess)
- Guest user's phone number (often not secret)

```typescript
const isGuestOwner = order.guestUserId && phoneValue
  ? await this.prisma.guestUser.findFirst({
      where: { id: order.guestUserId, phone: phoneValue },
    })
  : false;
```

Phone numbers are relatively easy to obtain or guess. No audit trail, no rate limiting.

**Fix Required:**
- Require authentication for receipt download
- Or send receipt via email only with a signed, time-limited token
- Add rate limiting and logging

---

### 16. `getUserReservations()` Excludes Anonymous Reservations

**File:** `src/stock-reservation/stock-reservation.service.ts` (lines 302-308)  
**Severity:** MEDIUM  
**Impact:** Anonymous users cannot view their reservations

The method returns empty if `!effectiveUserId`. Anonymous reservations use `userId = -1`, which is truthy, so they would pass the check. However, the logic is fragile and the API design with `-1` sentinel is problematic (see bug #7).

**Fix Required:** Use nullable `userId` in DB and in code. Handle `null` explicitly.

---

## 🗄️ DATABASE & SCHEMA ISSUES

### 17. Missing Unique Constraints on Order Numbers

**File:** `prisma/schema.prisma` (lines 144-163)  
**Severity:** CRITICAL

The `Order` model has `orderNumber` and `invoiceNumber` fields but no `@unique` constraint. The application tries to avoid duplicates via code (bug #3), but this is not reliable. A database unique constraint is the final safeguard.

**Fix:**
```prisma
model Order {
  id            Int    @id @default(autoincrement())
  orderNumber   String @unique
  invoiceNumber String @unique
  // ... other fields
}
```

Run `npx prisma migrate dev` after updating schema.

---

### 18. No Check Constraint Preventing Negative Stock

**File:** `prisma/schema.prisma` (line 86)  
**Severity:** MEDIUM-HIGH  
**Impact:** Data integrity risk, overselling

`ProductVariant.stock` is defined as `Int` with no constraint. Even with application-level checks, race conditions (bug #2) can cause negative stock values.

**Fix:** Add database-level check constraint (supported in PostgreSQL):

```prisma
model ProductVariant {
  // ...
  stock Int @db.Check("stock >= 0")
}
```

If Prisma doesn't support `@db.Check` directly, use a migration with raw SQL:
```sql
ALTER TABLE "ProductVariant" ADD CONSTRAINT stock_non_negative CHECK (stock >= 0);
```

---

### 19. Missing Indexes for Common Queries

**File:** `prisma/schema.prisma`  
**Severity:** MEDIUM  
**Impact:** Slow queries, timeouts under load

**Missing indexes:**
- `Order(userId)` – used in `OrderService.findAll()` for customer orders (line 690), `OrderService.findOne()` (line 786)
- `Order(guestUserId)` – used in `trackGuestOrder()` (line 559), `findOne()` (line 788)
- `Order(orderNumber)`, `Order(invoiceNumber)` – used for duplicate check (line 174) and lookups
- `Order(userId, createdAt)` – composite index for user order history queries (line 690 with orderBy createdAt)
- `ProductVariant(isActive, isDeleted)` – frequently queried together (e.g., line 198)
- `Image(productId)` – products fetch images; ensure index exists

**Fix:** Add to Prisma schema:

```prisma
model Order {
  // ...
  @@index([userId])
  @@index([guestUserId])
  @@index([orderNumber])
  @@index([invoiceNumber])
  @@index([userId, createdAt])
}

model ProductVariant {
  // ...
  @@index([isActive, isDeleted])
}
```

---

### 20. Soft Delete Pattern Inconsistently Applied

**File:** `prisma/schema.prisma` & various service files  
**Severity:** MEDIUM  
**Impact:** Deleted data may leak into responses

Products and variants have `isDeleted` + `deletedAt` soft delete fields. Most queries filter `isDeleted: false`, but not all:

- `OrderService.create()` fetches variants without `isDeleted: false` filter (line 108-111) → deleted variants can be ordered
- `ProductService.findAll()` filters variants with `isDeleted: false` (line 198) – good
- `ProductService.findOne()` filters with `isDeleted: false` (line 520) – good
- `OrderService.findOne()` filters items with `variant: { isDeleted: false }` (line 830) – good

**Risk:** Any query that forgets the filter will include deleted records.

**Fix:** Consider using database-level partial indexes or a global query filter (Prisma `@where` middleware) to automatically exclude soft-deleted records. Alternatively, add explicit comments and lint rules to ensure all queries include the filter.

---

## ⚡ PERFORMANCE ISSUES

### 21. `findAll()` Always Fetches Stock Even When Not Needed

**File:** `src/product/product.service.ts` (lines 228-235)  
**Severity:** LOW-MEDIUM  
**Impact:** Unnecessary database query on product listings

The `includeStock` parameter defaults to `true` (line 172) and is not respected; the stock query always runs. For list views that only need price/thumbnail, this is wasteful.

**Fix:** Only call `getAvailableStockBulk()` if `includeStock === true`.

---

### 22. PDF Generation Blocks Event Loop

**File:** `src/order/order.service.ts` (lines 1095-1650)  
**Severity:** HIGH  
**Impact:** Request timeouts, server unresponsiveness under load

The `generateReceipt()` method performs synchronous, CPU-intensive PDF generation in the request path. PDFKit operations are blocking; with concurrent requests, this will quickly exhaust the event loop, causing all requests to slow down or timeout.

**Fix:** Offload PDF generation to a job queue (BullMQ, Agenda) or use worker threads. Return a job ID and provide a webhook/WS notification when ready, or store PDF in S3/cloud storage and provide download link.

---

### 23. `product.update()` Uses Parallel Updates Without Batching

**File:** `src/product/product.service.ts` (lines 667-817)  
**Severity:** LOW-MEDIUM  
**Impact:** Database connection pool exhaustion with many updates

The method uses `Promise.all()` to fire many individual `image.update()`, `image.createMany()`, `productVariant.update()`, and `productVariant.create()` calls in parallel. With large updates (e.g., 50 images, 100 variants), this can spawn 150+ concurrent queries, overwhelming the DB connection pool.

**Fix:** Batch operations using `createMany`/`updateMany` where possible, or use a semaphore to limit concurrency (e.g., 10 at a time).

---

## 🔐 SECURITY & AUTHORIZATION

### 24. `releaseReservation()` Allows Release of Any Reservation Without Ownership

**File:** `src/stock-reservation/stock-reservation.service.ts` (lines 184-196)  
**Severity:** MEDIUM-HIGH  
**Impact:** Reservation hijacking, order disruption

Already covered in bug #13. A malicious user can release another user's reservation by simply providing the reservation ID and omitting user credentials.

---

### 25. `getReservationById()` No Ownership Check

**File:** `src/stock-reservation/stock-reservation.controller.ts` (lines 124-128)  
**Severity:** MEDIUM  
**Impact:** Information disclosure

The endpoint `GET /stock-reservation/:id` is protected by `JwtAuthGuard` but does **not** verify that the authenticated user owns the reservation. Any logged-in user can fetch any reservation by ID and see variant details, prices, etc.

**Fix:** Add ownership check in service or controller: `if (reservation.userId !== req.user.id) throw new ForbiddenException()`.

---

### 26. `Order.findOne()` Security Check Flawed for Guest Orders

**File:** `src/order/order.service.ts` (line 886)  
**Severity:** MEDIUM  
**Impact:** Guest order information leak to authenticated users

```typescript
if (userRole !== Role.ADMIN && order.userId !== userId && !order.guestUserId) {
  throw new ForbiddenException(...);
}
```

The condition `!order.guestUserId` means: if the order has **no** guestUserId, forbid. But if the order **has** a guestUserId (any truthy value), the condition passes and ANY authenticated user can view that guest order. This is incorrect; only the guest user (matched by phone) or admin should view guest orders.

**Fix:** For guest orders, require phone verification (like in `downloadReceipt`) or disallow authenticated users from viewing guest orders entirely (only admin or guest via phone).

---

## 📊 BUSINESS LOGIC & DATA INTEGRITY

### 27. Guest User `findOrCreate()` Overwrites Historical Data

**File:** `src/guest-user/guest-user.service.ts` (lines 29-38)  
**Severity:** MEDIUM  
**Impact:** Historical order data becomes inaccurate; address history lost

When a guest user places a new order, `findOrCreate()` finds the existing guest by phone and **updates** their name, email, address, city, postalCode. This means:
- Old orders linked to that guest user will now show the **new** address when queried (because they join to guestUser)
- Historical record is lost; you cannot tell where the order was originally shipped

**Fix:** Do NOT update guest user on subsequent orders. Either:
- Create a new guest user per order (but phone unique constraint prevents this)
- Store address snapshot directly in the `Order` table (denormalize) and keep guest user as a contact reference only
- Keep guest user immutable after creation (update only if fields are null)

Recommended: Snapshot all shipping address fields in `Order` (add columns: `shippingName`, `shippingPhone`, `shippingEmail`, `shippingAddress`, `shippingCity`, `shippingPostalCode`, `shippingCountry`) and stop relying on `guestUserId` for historical data.

---

### 28. Orders Do Not Snapshot Customer/Address Data

**File:** `src/order/order.service.ts` (lines 256-335)  
**Severity:** MEDIUM  
**Impact:** Historical orders show mutated data; audit trail broken

Orders store foreign keys: `userId`, `guestUserId`, `addressId`. When retrieving an order, the service joins to these tables to get the current data. If a user changes their email, or an address is updated, or a guest user's address is overwritten (bug #27), the historical order will show the **new** data, not what was at the time of purchase.

**Fix:** Denormalize critical fields into the `Order` table at creation time:
- For authenticated: copy `user.email`, `address` fields (all address columns)
- For guest: copy `guestUser` name/phone/email/address/city/postalCode

Make `addressId` nullable and only used for saved addresses; snapshot the address text into order.

---

### 29. `updateStatus()` Cancellation Restores Stock Even for Shipped Orders

**File:** `src/order/order.service.ts` (lines 958-982)  
**Severity:** MEDIUM  
**Impact:** Stock restoration for orders that may have already been delivered

When order status is changed to `CANCELLED`, the code unconditionally loops through all order items and:
- For reservation items: changes status to `RELEASED` (no stock increment – bug #6)
- For non-reservation items: increments stock

But what if the order was already `SHIPPED` or `DELIVERED` and then cancelled? Restoring stock would be incorrect because the physical goods may have already been sent. The current validation (lines 929-942) allows cancelling a shipped order? It only blocks status change from DELIVERED (except to CANCELLED) and from CANCELLED. So SHIPPED → CANCELLED is allowed, and stock would be restored even though the package might be in transit.

**Fix:** Add business rule validation:
- Only allow cancellation if status is PENDING or PAID
- If shipped, require return process instead of direct stock restore
- Or track whether stock was already deducted and needs restoration based on order state, not just cancellation

---

### 30. `markReservationAsUsed()` Throws After Partial Update

**File:** `src/stock-reservation/stock-reservation.service.ts` (lines 247-268)  
**Severity:** LOW-MEDIUM  
**Impact:** Confusing control flow; callers must handle exception as "success with expired"

If a reservation is expired when `markReservationAsUsed()` is called:
1. Updates reservation to EXPIRED and links orderId (lines 250-257)
2. Restores stock (lines 259-263)
3. Throws `BadRequestException` (line 266)

The reservation is correctly marked expired and stock restored, but the exception suggests failure. The order creation will fail, but the reservation state is updated. This is a weird pattern: the method has side effects and then throws.

**Fix:** Return a specific result object indicating `status: 'EXPIRED'` instead of throwing, or don't update the reservation at all and just throw. The current approach leaves the reservation in an expired state but the order not created – that's okay, but the exception message should be clearer.

---

### 31. `getAvailableStock()` Returns Misleading Field Names

**File:** `src/stock-reservation/stock-reservation.service.ts` (lines 369-378)  
**Severity:** LOW  
**Impact:** API consumers misunderstand stock levels

Response:
```typescript
{
  totalStock: variant.stock,           // Actually current available stock
  reservedStock: reservedQuantity,     // Active reservation quantity
  availableStock: Math.max(0, variant.stock) // Same as totalStock!
}
```

`totalStock` implies original physical inventory before reservations, but it's actually the current stock (after reservations have already decremented). `availableStock` equals `totalStock`, making both redundant and confusing.

**Fix:** Either:
- Store original `totalStock` separately in the DB and update it only on restock, OR
- Rename fields: `currentStock` and `availableStock` (both same), or just return `stock` and `reservedStock`

---

### 32. `findByCategory()` Sets `discountAmount: 0` Always

**File:** `src/product/product.service.ts` (line 487)  
**Severity:** BUG  
**Impact:** Discount information missing on category product listings

In `findByCategory()`, the returned product object hardcodes `discountAmount: 0` (line 487), whereas `findAll()` correctly calculates it as `minPrice - minFinalPrice` (lines 304-307). This inconsistency means category pages don't show discount amounts.

**Fix:** Calculate `discountAmount` the same way as in `findAll()`.

---

### 33. `create()` Does Not Validate Address Ownership

**File:** `src/order/order.service.ts` (line 263)  
**Severity:** MEDIUM  
**Impact:** Users can order with someone else's address

The `addressId` from DTO is passed directly to order creation without verifying that the address belongs to the authenticated user. A malicious user could supply another user's address ID and have the order shipped to them.

**Fix:** Before transaction, validate:
```typescript
if (dto.addressId) {
  const address = await this.prisma.address.findUnique({
    where: { id: dto.addressId },
  });
  if (!address || address.userId !== userId) {
    throw new ForbiddenException('Invalid address');
  }
}
```

---

### 34. `Product` `create()` No SKU Uniqueness Validation

**File:** `src/product/product.service.ts` (lines 115-137)  
**Severity:** MEDIUM  
**Impact:** Database unique constraint violation, order creation failure

The method creates multiple variants in one go. If two variants in the same request have the same SKU, or if a variant's SKU already exists in the database, the Prisma `create` will fail with a duplicate key error. The error is not caught and returns a 500.

**Fix:** Validate SKU uniqueness before create:
```typescript
const skus = dto.variants.map(v => v.sku);
const existing = await this.prisma.productVariant.findMany({
  where: { sku: { in: skus } },
});
if (existing.length > 0) {
  throw new ConflictException('SKU already exists');
}
```

Also generate SKUs server-side if not provided to ensure uniqueness.

---

### 35. `Product` `update()` SKU Upsert Race Condition

**File:** `src/product/product.service.ts` (lines 752-817)  
**Severity:** MEDIUM  
**Impact:** Duplicate key errors under concurrency

The upsert logic:
1. Fetches existing variants for the product (lines 699-706)
2. Builds a map of existing SKUs
3. For each variant to upsert, checks if SKU exists in map; if yes, update; if no, create

Between steps 1 and 3, another concurrent request could create a variant with the same SKU (either for this product or another product, since SKU is globally unique). The `create` will then fail with duplicate key error.

**Fix:** Use Prisma's `upsert` with `where: { sku }` on a unique field, or catch duplicate key error and retry as update, or use a database-level `ON CONFLICT` (PostgreSQL) via raw query.

---

### 36. `Product` `update()` Does Not Validate AttributeValues Exist

**File:** `src/product/product.service.ts` (lines 130-136, 803-809)  
**Severity:** MEDIUM  
**Impact:** Foreign key constraint errors, variant creation fails

When creating variant attributes, the code uses `attributeValueId` from the DTO without checking if that attribute value exists. If an invalid ID is passed, Prisma throws a foreign key constraint error.

**Fix:** Validate all `attributeValueId`s exist before creating variants:
```typescript
const attributeValueIds = variant.attributes.map(a => a.valueId);
const existingValues = await this.prisma.attributeValue.findMany({
  where: { id: { in: attributeValueIds } },
});
if (existingValues.length !== attributeValueIds.length) {
  throw new NotFoundException('Invalid attribute value');
}
```

---

### 37. `Order` `create()` Does Not Filter `isDeleted` on Variant Fetch

**File:** `src/order/order.service.ts` (lines 108-111)  
**Severity:** MEDIUM  
**Impact:** Deleted variants can be ordered

The query to fetch variants:
```typescript
const variants = await this.prisma.productVariant.findMany({
  where: { id: { in: variantIds } },
  include: { product: true },
});
```
Does **not** include `isDeleted: false`. A soft-deleted variant can be ordered, which should not be allowed.

**Fix:** Add `isDeleted: false` (and possibly `isActive: true`) to the where clause.

---

### 38. `Product` `findAll()` Includes Inactive Variants

**File:** `src/product/product.service.ts` (line 198)  
**Severity:** LOW  
**Impact:** Inactive variants appear in product listings

The variant select filter:
```typescript
variants: {
  where: { isDeleted: false },
  // ...
}
```
Only filters `isDeleted`, not `isActive`. Inactive variants (`isActive: false`) are still included in the response.

**Fix:** Add `isActive: true` to the where clause.

---

### 39. `guestUser.findOrCreate()` Race Condition

**File:** `src/guest-user/guest-user.service.ts` (lines 22-38)  
**Severity:** MEDIUM  
**Impact:** Duplicate key error under concurrent requests

The find-then-create pattern is not atomic:
```typescript
const existingGuest = await this.prisma.guestUser.findUnique({ where: { phone: data.phone } });
if (existingGuest) {
  return this.prisma.guestUser.update(...);
}
return this.prisma.guestUser.create(...);
```

Two concurrent requests with the same phone can both pass the `findUnique` check (neither exists yet) and both attempt to `create`, causing a duplicate key violation on the unique `phone` field.

**Fix:** Use `upsert`:
```typescript
return this.prisma.guestUser.upsert({
  where: { phone: data.phone },
  update: { ... },
  create: { ... },
});
```

---

### 40. Order Number Generation Uses First Product ID Arbitrarily

**File:** `src/order/order.service.ts` (lines 167, 423)  
**Severity:** LOW  
**Impact:** Order numbers not meaningful, potential collisions

`primaryProductId = variants[0]?.product?.id` uses the first item's product ID. This is arbitrary (depends on item order in cart) and not user-friendly. The format `yyyymmddproductId` also means all orders for the same product on a day share the same base number, requiring suffixes that make the number less readable.

**Fix:** Use a separate sequence or UUID for order numbers. Consider format: `ORD-{YYYY}{MM}{DD}-{random 4 digits}` or use database sequence.

---

## 📋 ADDITIONAL ISSUES (41-50+)

### 41. `createGuest()` Does Not Validate Guest Phone Matches Reservation
The reservation ownership check uses undefined `userId`. Should fetch guest user by DTO phone and compare to `reservation.userId`.

### 42. `create()` Does Not Handle Case Where All Items Have Reservations
The code processes reservation items but doesn't handle the case where ALL items have reservations and no non-reservation items exist. Actually it works because the loop handles all items with reservations. But if NO items have reservations, the loop is skipped and stock deduction is missing (bug #9).

### 43. `create()` Does Not Deduct Stock for Non-Reservation Items (Already Bug #1)
Reiterated.

### 44. `releaseExpiredReservations()` Does Not Check if Reservation Linked to Order
The scheduler releases ALL expired active reservations, even if they are already linked to an order (`orderId` not null). Should only expire reservations that are still active and not used in an order, or check that the linked order is cancelled.

**Fix:** Add `orderId: null` to the where clause, or check order status.

### 45. `markReservationAsUsed()` Does Not Check if Already Linked to Different Order
If a reservation already has an `orderId` (from previous use), it will still update status to USED but doesn't update `orderId`. This could leave the reservation linked to the wrong order. Should verify `orderId IS NULL` before marking as used.

### 46. `Product` `findAll()` `hasDiscount` Calculation May Be Inconsistent
Sets `hasDiscount = true` if any variant has discount. That's okay. But `discountAmount` is calculated as difference between minPrice and minFinalPrice of the cheapest variant. This shows the discount on the cheapest variant, not the maximum discount available. Consider showing max discount instead.

### 47. `Product` `findByCategory()` Missing `minFinalPrice` Field
The response includes `minPrice` but not `minFinalPrice`. Should include for consistency with `findAll()`.

### 48. `StockReservation` `reserveStock()` Does Not Limit Maximum Quantity
No per-user or per-variant reservation limits. A user could reserve all stock, blocking others.

**Consider:** Add limits like max 5 units per user per variant, or total active reservations limit.

### 49. `Order` `updateStatus()` Status Transition Validation Incomplete
Only checks:
- Cannot change if DELIVERED (except to CANCELLED)
- Cannot change if CANCELLED

Missing:
- PENDING → PAID (allowed? Should be payment webhook)
- PAID → SHIPPED (allowed)
- SHIPPED → DELIVERED (allowed)
- SHIPPED → CANCELLED (should it be allowed? Currently allowed but stock restoration may be wrong)
- DELIVERED → anything (blocked)

Implement a proper state machine.

### 50. `OrderItem` Should Not Allow Deleted Variant
Already covered in bug #37.

### 51. `OrderItem` Reservation ID Not Included in `findOne()` Response
**File:** `src/order/order.service.ts` (lines 833-875)  
The select for items omits `reservationId`. Useful for customers to see which items used reservations.

**Fix:** Add `reservationId: true` to item select.

### 52. `Product` `removeVariant()` Does Not Check for Active Reservations
Soft-deleting a variant that has active reservations could leave those reservations pointing to a deleted variant. Should either prevent deletion or release reservations first.

### 53. `StockReservation` Indexes May Be Redundant
**File:** `prisma/schema.prisma` (lines 195-199)  
Indexes:
- `(userId, status)`
- `(variantId, status)`
- `(expiresAt)`
- `(variantId, status, expiresAt)`

The composite `(variantId, status, expiresAt)` covers queries like `where: { variantId, status: 'ACTIVE', expiresAt: { gt: ... } }`. The separate `(variantId, status)` and `(expiresAt)` may be redundant. Review and remove unused ones.

### 54. `Image` Model Allows Orphaned Images
**File:** `prisma/schema.prisma` (lines 129-142)  
All foreign keys (`productId`, `variantId`, `categoryId`) are nullable, and there's no check that at least one is non-null. An image could be created with no relationships, wasting storage.

**Fix:** Add application-level validation or database check constraint to ensure exactly one relation is set.

### 55. `Address` Model Missing Index on `userId`
**File:** `prisma/schema.prisma` (lines 24-39)  
While Prisma may auto-create index for foreign keys, explicitly add `@@index([userId])` for clarity and performance.

---

## 🎯 PRIORITIZED FIX ROADMAP

### Phase 1: Critical Stock & Order Bugs (Deploy Immediately)
1. Fix bug #1 & #9: Implement missing stock deduction in `OrderService.create()` for non-reservation items
2. Fix bug #2: Use atomic conditional update in `createGuest()` (and verify `create()` uses same pattern)
3. Fix bug #6: Restore stock on cancellation for reservation items
4. Fix bug #8: Resolve undefined `userId` in `createGuest()` – fetch guest user properly
5. Add DB unique constraints on `orderNumber` and `invoiceNumber` (issue #17)
6. Add check constraint `stock >= 0` (issue #18)
7. Fix bug #4: Standardize delivery charges (make configurable)
8. Fix bug #7: Allow anonymous reservations to be releasable (use nullable userId)

### Phase 2: Data Integrity & Security (Deploy Soon)
9. Fix bug #13: `releaseReservation()` authorization – require user match
10. Fix bug #27: Stop overwriting guest user data; snapshot address in order
11. Fix bug #28: Denormalize order fields (snapshot customer/address at order time)
12. Fix bug #26: Fix `findOne()` security check for guest orders
13. Add missing indexes (issue #19)
14. Fix bug #37: Add `isDeleted: false` filter in order variant fetch
15. Fix bug #38: Add `isActive: true` filter in product variant queries
16. Fix bug #39: Use `upsert` in `guestUser.findOrCreate()` to avoid race

### Phase 3: Performance & Reliability (Next Sprint)
17. Fix bug #11: Make `product.update()` transactional
18. Fix bug #12: Bulk update in reservation cleanup methods
19. Fix bug #22: Offload PDF generation to queue
20. Fix bug #21: Respect `includeStock` flag in `findAll()`
21. Fix bug #23: Batch parallel updates in `product.update()`
22. Fix bug #14: Add rate limiting to `trackGuestOrder`
23. Fix bug #15: Secure receipt download (auth or token)

### Phase 4: Polish & Edge Cases
24. Fix bug #32: Calculate `discountAmount` in `findByCategory()`
25. Fix bug #33: Validate address ownership in order create
26. Fix bug #34: Validate SKU uniqueness before product create
27. Fix bug #35: Handle SKU upsert race condition
28. Fix bug #36: Validate attribute values exist
29. Review and implement proper order status state machine (bug #49)
30. Add proper error handling and logging throughout

---

## 📊 SUMMARY TABLE

| # | Issue | Severity | File | Lines |
|---|-------|----------|------|-------|
| 1 | Missing stock deduction for non-reservation items in `create()` | CRITICAL | order.service.ts | 252-254 (missing) |
| 2 | Race condition in stock deduction (createGuest) | CRITICAL | order.service.ts | 461-474 |
| 3 | Duplicate order/invoice numbers + no DB unique constraint | CRITICAL | order.service.ts, schema.prisma | 170-186, 144-163 |
| 4 | Inconsistent delivery charges (120 vs 70) | CRITICAL | order.service.ts | 163, 419 |
| 5 | `checkAvailability()` ignores reservations | CRITICAL | stock-reservation.service.ts | 442-472 |
| 6 | Stock not restored on cancellation for reservation items | CRITICAL | order.service.ts | 968-972 |
| 7 | Anonymous reservations (-1 userId) cannot be released | CRITICAL | stock-reservation.service.ts | 52-54, 190 |
| 8 | `createGuest()` undefined `userId` variable | CRITICAL | order.service.ts | 208 |
| 9 | `create()` missing stock deduction code entirely | CRITICAL | order.service.ts | 252 |
| 10 | reCAPTCHA bypass when env missing | HIGH | order.service.ts | 64-68 |
| 11 | Product update not transactional | HIGH | product.service.ts | 606-819 |
| 12 | O(N) loop in reservation cleanup | MEDIUM-HIGH | stock-reservation.service.ts | 497-519, 586-605 |
| 13 | `releaseReservation()` authorization bypass | MEDIUM-HIGH | stock-reservation.service.ts | 184-196 |
| 14 | `trackGuestOrder()` no rate limiting | MEDIUM-HIGH | order.service.ts | 552-621 |
| 15 | `downloadReceipt()` weak security | MEDIUM-HIGH | order.controller.ts | 115-141 |
| 16 | `getUserReservations()` excludes anonymous | MEDIUM | stock-reservation.service.ts | 302-308 |
| 17 | Missing unique constraints on order numbers | CRITICAL | schema.prisma | 144-163 |
| 18 | No check constraint stock >= 0 | MEDIUM-HIGH | schema.prisma | 86 |
| 19 | Missing indexes on Order(userId), etc. | MEDIUM | schema.prisma | 144 |
| 20 | Soft delete inconsistencies | MEDIUM | multiple | 108, 198, 520, 830 |
| 21 | `findAll()` always fetches stock | LOW-MEDIUM | product.service.ts | 228-235 |
| 22 | PDF generation blocks event loop | HIGH | order.service.ts | 1095-1650 |
| 23 | `product.update()` parallel updates unbounded | LOW-MEDIUM | product.service.ts | 667-817 |
| 24 | `getReservationById()` no ownership check | MEDIUM | stock-reservation.controller.ts | 124-128 |
| 25 | `findOne()` security check flawed for guest orders | MEDIUM | order.service.ts | 886 |
| 26 | Guest user data overwritten on new order | MEDIUM | guest-user.service.ts | 29-38 |
| 27 | Orders don't snapshot address/user data | MEDIUM | order.service.ts | 256-335 |
| 28 | Cancellation restores stock for shipped orders? | MEDIUM | order.service.ts | 958-982 |
| 29 | `markReservationAsUsed()` throws after partial update | LOW-MEDIUM | stock-reservation.service.ts | 247-268 |
| 30 | Misleading stock API field names | LOW | stock-reservation.service.ts | 369-378 |
| 31 | `findByCategory()` `discountAmount: 0` | BUG | product.service.ts | 487 |
| 32 | `create()` doesn't validate address ownership | MEDIUM | order.service.ts | 263 |
| 33 | Product create no SKU uniqueness validation | MEDIUM | product.service.ts | 115-137 |
| 34 | Product update SKU upsert race condition | MEDIUM | product.service.ts | 752-817 |
| 35 | Order create doesn't filter `isDeleted` on variants | MEDIUM | order.service.ts | 108-111 |
| 36 | `findAll()` includes inactive variants | LOW | product.service.ts | 198 |
| 37 | `guestUser.findOrCreate()` race condition | MEDIUM | guest-user.service.ts | 22-38 |
| 38 | Order number generation arbitrary | LOW | order.service.ts | 167, 423 |
| 39 | `releaseReservation()` should check `orderId` null | MEDIUM | stock-reservation.service.ts | 194-196 |
| 40 | `markReservationAsUsed()` should check `orderId` null | LOW | stock-reservation.service.ts | 238-240 |
| ... | Additional minor issues (41-50+) | VARIOUS | various | various |

**Total Issues Identified: 50+**

---

## 🚀 IMMEDIATE ACTION ITEMS (Top 10)

1. ✅ **Fix missing stock deduction** in `OrderService.create()` – add atomic updates for non-reservation items
2. ✅ **Fix race condition** in `createGuest()` stock deduction – use conditional `where: { stock: { gte: quantity } }`
3. ✅ **Add unique constraints** on `Order.orderNumber` and `Order.invoiceNumber` in Prisma schema
4. ✅ **Standardize delivery charges** – extract to config or unify values
5. ✅ **Fix stock restoration** on cancellation for reservation items (increment stock)
6. ✅ **Fix anonymous reservation handling** – allow release/tracking or use `null` userId
7. ✅ **Fix `createGuest` undefined `userId`** – fetch guest user by phone first
8. ✅ **Add DB check constraint** `stock >= 0` to `ProductVariant`
9. ✅ **Add indexes** on `Order(userId)`, `Order(guestUserId)`, `Order(userId, createdAt)`
10. ✅ **Fix `releaseReservation()` authorization** – always require user match

---

**Report Generated:** 2026-04-19  
**Reviewer:** Automated Code Analysis  
**Files Reviewed:** 50+ across `src/`, `prisma/schema.prisma`
