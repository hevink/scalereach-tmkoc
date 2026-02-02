# Production Launch Checklist

## 🔴 CRITICAL - Must Complete Before Launch

### Security
- [ ] **Rotate ALL credentials** - Database password, SMTP, OAuth secrets, Better Auth secret
- [ ] **Remove .env from git history** - `git filter-branch --tree-filter 'rm -f .env' HEAD`
- [ ] **Set NODE_ENV=production** in production environment
- [ ] **Enable HTTPS/SSL** on your domain
- [ ] **Verify CORS** only allows your production frontend URL

### Authentication
- [ ] **Test Google OAuth** in production environment
- [ ] **Test email verification** flow end-to-end
- [ ] **Test password reset** flow end-to-end
- [ ] **Test 2FA** setup and verification

### Database
- [ ] **Set up database backups** (Neon has automatic backups)
- [ ] **Test database connection** from production server
- [ ] **Run migrations** in production

## 🟡 HIGH PRIORITY - Should Complete Before Launch

### API Security
- [ ] Add rate limiting to auth endpoints
- [ ] Add workspace membership checks to all project/video endpoints
- [ ] Add input validation to all endpoints
- [ ] Test all API endpoints with invalid data

### Monitoring
- [ ] Configure Sentry DSN for error tracking
- [ ] Set up uptime monitoring (e.g., UptimeRobot)
- [ ] Configure log aggregation

### Payments
- [ ] Configure Dodo Payments webhook endpoint
- [ ] Test payment flow end-to-end
- [ ] Implement credit deduction on video processing

## 🟢 RECOMMENDED - Can Complete After Launch

### Performance
- [ ] Add pagination to list endpoints
- [ ] Add caching for frequently accessed data
- [ ] Set up CDN for static assets

### Features
- [ ] Add filtering/sorting to list endpoints
- [ ] Add soft delete for projects/videos
- [ ] Add audit logging

## Environment Variables Required

```bash
# Required
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=<generate-new-secret>
BETTER_AUTH_URL=https://api.yourdomain.com
FRONTEND_URL=https://yourdomain.com
NODE_ENV=production

# Authentication
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>

# Email
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=<your-smtp-user>
SMTP_PASS=<your-smtp-password>
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_FROM_NAME=ScaleReach

# Monitoring (recommended)
SENTRY_DSN=https://xxx@sentry.io/xxx

# Payments (when ready)
DODO_PAYMENTS_API_KEY=<your-dodo-key>
DODO_WEBHOOK_SECRET=<your-webhook-secret>
```

## Generate New Secrets

```bash
# Generate new Better Auth secret
openssl rand -base64 32

# Generate new webhook secret
openssl rand -hex 32
```

## Deployment Commands

```bash
# Build
bun run build

# Run migrations
bun run db:push

# Start production server
NODE_ENV=production bun run start
```
