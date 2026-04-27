# Email Logger Implementation Plan

## Objective
Implement a comprehensive email logging system that tracks:
- Which user received which email for which order
- Email delivery status (success/failure)
- Failure reasons for admin review
- Capability for admins to manually resend failed emails

## Core Components

### 1. Database Schema Extension
**New Entity: EmailLog**
- `id`: Primary key
- `orderId`: Foreign key to Order (nullable for non-order emails)
- `userId`: Foreign key to User (nullable)
- `guestUserId`: Foreign key to GuestUser (nullable)
- `email`: Recipient email address
- `subject`: Email subject line
- `status`: Enum (PENDING, SENT, FAILED, RETRYING)
- `attemptCount`: Number of delivery attempts
- `lastAttemptAt`: Timestamp of last attempt
- `completedAt`: Timestamp when successfully sent
- `errorMessage`: Failure details (if any)
- `createdAt`: When log entry was created
- `updatedAt`: Last update timestamp
- **Indexes**: orderId, status, email for efficient querying

### 2. Email Logging Service
**EmailLogService Responsibilities:**
- Create new email log entries when email is queued
- Update log status after delivery attempts
- Retrieve logs by order ID
- Query failed emails for admin dashboard
- Handle both user and guest order emails

### 3. Modified Email Sending Flow
**Order Creation Process:**
1. After successful order creation in transaction
2. Create EmailLog entry with PENDING status
3. Pass log ID to mailer service when queuing email
4. Mailer service includes log ID in job data
5. Bull processor updates log based on delivery outcome

**Email Processing (MailerProcessor):**
- On job start: Increment attemptCount, update lastAttemptAt
- On success: Set status to SENT, completedAt = now, clear errorMessage
- On failure: Set status to FAILED (after retries), store errorMessage
- Uses existing Bull retry mechanism (3 attempts with exponential backoff)

### 4. Admin Interface Components
**EmailLogController Endpoints:**
- `GET /admin/email-log/order/:orderId`: Get all email attempts for specific order
- `GET /admin/email-log/failed`: List all failed emails (paginated)
- `POST /admin/email-log/resend/:logId`: Trigger resend for specific log entry

**Resend Functionality:**
- Retrieve original order from log entry
- Use existing mailer service to queue new email
- Creates new EmailLog entry for resend attempt
- Preserves original log for audit trail

### 5. Integration Points
**OrderService Modifications:**
- After order transaction completes
- Call emailLogService.createLog() with order details
- Pass returned log ID to mailerService.sendOrderConfirmationEmail()

**MailerService Changes:**
- Accept optional emailLogId in sendOrderConfirmationEmail()
- Include logId in job data sent to Bull queue

**MailerProcessor Enhancements:**
- Receive logId in job data
- Update email log after delivery attempt
- Handle both success and failure paths

### 6. Security Considerations
- All admin endpoints protected by:
  - JWT authentication
  - Roles guard (ADMIN only)
- No sensitive data exposed in logs (only email, subject, status)
- Error messages stored but could be truncated if needed
- Rate limiting recommended for resend endpoint

### 7. Implementation Sequence
1. Create EmailLog entity in Prisma schema
2. Generate and apply migration
3. Implement EmailLogService with CRUD operations
4. Modify MailerService to accept and propagate logId
5. Update MailerProcessor to update logs on job completion
6. Create EmailLogController with admin endpoints
7. Integrate EmailLogService into MailerModule
8. Add OrderService modifications to create logs
9. Test end-to-end flow with success/failure scenarios
10. Verify admin dashboard shows correct statuses
11. Confirm resend functionality creates new attempts

### 8. Key Benefits
- **Complete Audit Trail**: Every email attempt recorded with timestamps
- **Failure Visibility**: Admins see exactly which emails failed and why
- **Manual Recovery**: One-click resend from failure reports
- **Non-Blocking**: Logging doesn't affect order creation performance
- **Extensible Design**: Can accommodate other email types later
- **Consistent UX**: Uses existing email infrastructure patterns

This plan leverages the existing email queueing infrastructure while adding minimal, focused changes to provide the requested logging and manual resend capabilities. The solution maintains system reliability while enhancing operational visibility.