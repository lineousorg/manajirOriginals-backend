# Email Notifications Setup Guide

## Overview

This guide explains how to set up email notifications for order confirmations. When a customer places an order, they receive an email with a PDF receipt attached.

---

## Architecture

```
OrderService.create()
    ↓
MailerService.sendOrderConfirmationEmail() → Adds job to Bull queue
    ↓
Bull Queue (Redis - local or Upstash)
    ↓
MailerProcessor.handleOrderConfirmationEmail()
    ↓
nodemailer (Gmail SMTP) → Email sent with PDF attachment
```

---

## Prerequisites

### 1. Redis (Required for Bull Queue)

**For Local Development:**
```bash
# macOS
brew install redis
brew services start redis

# Windows (WSL)
sudo apt install redis-server
redis-server --daemonize yes
```

**Verify Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

### 2. Gmail App Password (Required for Sending Emails)

1. Go to: myaccount.google.com → Security
2. Enable 2-Step Verification
3. Go to: myaccount.google.com → Security → App Passwords
4. Create new app password:
   - App: Mail
   - Device: Other (Custom name: "Manajir")
5. Copy the 16-character password (format: xxxx xxxx xxxx xxxx)

---

## Environment Variables

### .env.development

```bash
# Redis for Bull Queue
REDIS_HOST=localhost
REDIS_PORT=6379

# Email (Gmail SMTP) - NOTE: MAILER_SECURE must be string "false"
MAILER_HOST=smtp.gmail.com
MAILER_PORT=587
MAILER_SECURE=false
MAILER_USER=your-email@gmail.com
MAILER_PASSWORD=your-16-char-app-password
MAILER_FROM=your-email@gmail.com
MAILER_FROM_NAME=Manajir Original
```

**Important:**
- `MAILER_SECURE=false` - Must be string "false", not boolean
- Use your Gmail address and the App Password (not your regular password)

---

## Testing the Setup

### Step 1: Start Redis
```bash
# Terminal 1
redis-server
```

### Step 2: Start the App
```bash
# Terminal 2
npm run start:dev
```

### Step 3: Check Startup Logs

You should see:
```
SMTP connection verified successfully
Email transporter initialized successfully
Bull queue ready
```

### Step 4: Test by Placing an Order

1. Make a POST request to `/orders` or `/orders/guest`
2. Check the terminal logs for:
   - `Order confirmation email queued successfully`
   - `Generating PDF receipt for order X`
   - `Sending confirmation email to customer@email.com`
   - `Order confirmation email sent successfully`
3. Check your Gmail inbox (also check spam)

---

## Troubleshooting

### Issue: "Invalid login" or "Authentication failed"
**Solution:** You're not using an App Password. Generate one from myaccount.google.com → Security → App Passwords

### Issue: "Connection refused" or timeout
**Solution:** Check MAILER_HOST=smtp.gmail.com and MAILER_PORT=587

### Issue: "SMTP connection failed"
**Solution:** Make sure Redis is running (`redis-cli ping` returns PONG)

### Issue: Jobs stuck in queue
**Solution:** Check that Redis is running and app can connect

### Issue: Email goes to spam
**Solution:** First emails often go to spam. Mark as "Not spam" and add to contacts.

---

## Files Created/Modified

| File | Purpose |
|------|---------|
| src/receipt/receipt.module.ts | Receipt module |
| src/receipt/receipt.service.ts | PDF generation |
| src/mailer/mailer.module.ts | Mailer module with Bull queue |
| src/mailer/mailer.service.ts | Queue email jobs |
| src/mailer/mailer.processor.ts | Process jobs, send emails |
| src/mailer/templates/order-confirmation.hbs | Email template |

---

## Recent Bug Fixes Applied

1. **Fixed Boolean Parsing:** MAILER_SECURE now correctly parses string "false"
2. **Fixed Queue Name:** Using hardcoded 'order-emails' instead of dynamic
3. **Added SMTP Verification:** Connection verified at startup
4. **Fixed Failed Job Handler:** Using @OnQueueFailed() decorator