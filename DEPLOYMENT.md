# Deployment Guide

## Quick Start: Deploy to Vercel

### Prerequisites

1. **Vercel Account**: Sign up at https://vercel.com
2. **GitHub Repository**: Code pushed to GitHub
3. **Required API Keys**:
   - Supabase project (https://supabase.com)
   - Nango account (https://nango.dev)
   - Google Ads Developer Token
   - Meta Ads App (if using Meta)

### Step 1: Prepare Environment Variables

1. Copy `.env.example` to create your production environment setup
2. Gather all required values:

```bash
# Supabase (from https://app.supabase.com/project/_/settings/api)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... # From Supabase > Settings > API

# Nango (from https://app.nango.dev/dev)
NANGO_SECRET_KEY_DEV_PLAN_CHECK=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
NEXT_PUBLIC_NANGO_PUBLIC_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Google Ads API
GOOGLE_ADS_DEVELOPER_TOKEN=xxxxx
GOOGLE_ADS_MCC_ID=1234567890

# Generate a random 32+ character string for webhooks
WEBHOOK_SECRET=$(openssl rand -hex 32)

NODE_ENV=production
```

### Step 2: Deploy to Vercel

#### Option A: Vercel Dashboard

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Configure Project:
   - **Framework Preset**: Next.js
   - **Root Directory**: ./
   - **Build Command**: `npm run build`
   - **Output Directory**: .next
4. Add Environment Variables (from Step 1)
5. Click "Deploy"

#### Option B: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod

# Add environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add NANGO_SECRET_KEY_DEV_PLAN_CHECK production
vercel env add NEXT_PUBLIC_NANGO_PUBLIC_KEY production
vercel env add GOOGLE_ADS_DEVELOPER_TOKEN production
vercel env add GOOGLE_ADS_MCC_ID production
vercel env add WEBHOOK_SECRET production
vercel env add NODE_ENV production

# Redeploy with environment variables
vercel --prod
```

### Step 3: Configure Nango Webhook

1. Go to Nango Dashboard: https://app.nango.dev
2. Navigate to your project settings
3. Set Webhook URL: `https://your-vercel-domain.vercel.app/api/nango/webhook`
4. Select events to receive:
   - `auth.created`
   - `auth.deleted`
5. Save webhook configuration

### Step 4: Configure OAuth Redirect URLs

#### Nango

1. In Nango Dashboard > Integrations
2. For each integration (Google Ads, Meta Ads):
   - Add OAuth Redirect URI: `https://your-vercel-domain.vercel.app`

#### Google Ads

1. Google Cloud Console: https://console.cloud.google.com
2. APIs & Services > Credentials
3. Edit OAuth 2.0 Client
4. Add Authorized Redirect URI:
   - `https://api.nango.dev/oauth/callback`
   - `https://your-vercel-domain.vercel.app/api/nango/callback`

#### Meta Ads

1. Meta Developer Console: https://developers.facebook.com
2. Your App > Settings > Basic
3. Add App Domain: `your-vercel-domain.vercel.app`
4. Add Redirect URI in OAuth settings:
   - `https://api.nango.dev/oauth/callback`

### Step 5: Configure Supabase

1. **Update Site URL**:
   - Go to Supabase Dashboard > Authentication > URL Configuration
   - Set Site URL: `https://your-vercel-domain.vercel.app`
   - Add Redirect URL: `https://your-vercel-domain.vercel.app/auth/callback`

2. **Configure Row Level Security (RLS)**:

```sql
-- Enable RLS on all tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_accounts ENABLE ROW LEVEL SECURITY;

-- Example: Users can only access their own clients
CREATE POLICY "Users can access own clients"
ON clients FOR ALL
USING (auth.uid() = user_id);

-- Example: Users can access their ad platform connections
CREATE POLICY "Users can access own connections"
ON ad_platform_connections FOR ALL
USING (auth.uid() = user_id);

-- Add similar policies for all tables
```

3. **Create Database Indexes** (for performance):

```sql
CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_media_plans_client_id ON media_plans(client_id);
CREATE INDEX idx_channels_plan_id ON channels(plan_id);
CREATE INDEX idx_weekly_plans_channel_id ON weekly_plans(channel_id);
CREATE INDEX idx_ad_platform_connections_user_id ON ad_platform_connections(user_id);
CREATE INDEX idx_ad_platform_connections_client_id ON ad_platform_connections(client_id);
```

### Step 6: Test Deployment

1. **Visit your Vercel URL**: `https://your-vercel-domain.vercel.app`
2. **Test Authentication**:
   - Sign up for a new account
   - Log in
   - Log out
3. **Test Protected Routes**:
   - Try accessing `/dashboard` without logging in (should redirect)
   - Log in and access `/dashboard` (should work)
4. **Test Nango Integration**:
   - Create a client
   - Connect Google Ads or Meta Ads
   - Verify connection in Nango dashboard
5. **Test from Work Computer**:
   - Access from different network
   - Verify everything works

### Step 7: Custom Domain (Optional)

1. Vercel Dashboard > Your Project > Settings > Domains
2. Add your custom domain
3. Configure DNS:
   ```
   Type: A
   Name: @
   Value: 76.76.21.21

   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```
4. Wait for DNS propagation (~24 hours max)
5. Update all OAuth redirect URIs to use custom domain

## Monitoring & Maintenance

### Monitor Application

1. **Vercel Analytics**:
   - Go to your project > Analytics
   - Monitor traffic, errors, and performance

2. **Vercel Logs**:
   - Go to your project > Logs
   - Filter by severity (errors, warnings)

3. **Supabase Logs**:
   - Supabase Dashboard > Logs
   - Monitor database queries and errors

### Regular Maintenance

1. **Weekly**:
   - Check error logs
   - Monitor API usage
   - Review webhook events

2. **Monthly**:
   - Update dependencies: `npm update`
   - Review security audit: `npm audit`
   - Check for Next.js updates

3. **Quarterly**:
   - Review and update security policies
   - Audit user permissions
   - Review OAuth scopes

## Troubleshooting

### Common Issues

#### 1. "Unauthorized" errors on API routes

**Cause**: Missing or invalid Supabase session
**Fix**:
- Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- Verify user is logged in
- Check browser console for errors

#### 2. Nango connection fails

**Cause**: Incorrect OAuth redirect URIs
**Fix**:
- Verify redirect URIs in Google/Meta console
- Check Nango integration settings
- Ensure `NEXT_PUBLIC_NANGO_PUBLIC_KEY` is set

#### 3. Webhooks not received

**Cause**: Webhook URL not configured
**Fix**:
- Check Nango webhook settings
- Verify URL is correct: `https://your-domain/api/nango/webhook`
- Check Vercel function logs

#### 4. Build fails on Vercel

**Cause**: Missing environment variables or build errors
**Fix**:
- Check Vercel build logs
- Verify all required environment variables are set
- Try building locally: `npm run build`

#### 5. CORS errors

**Cause**: Incorrect origin configuration
**Fix**:
- Check `next.config.ts` headers configuration
- Verify domain matches in OAuth settings

## Rollback Procedure

If something goes wrong:

1. **Instant Rollback** (Vercel):
   - Go to Deployments
   - Click "..." on previous working deployment
   - Click "Promote to Production"

2. **Revert Code**:
   ```bash
   git revert HEAD
   git push
   # Vercel will auto-deploy
   ```

## Support

- **Vercel Support**: https://vercel.com/support
- **Supabase Support**: https://supabase.com/support
- **Nango Docs**: https://docs.nango.dev

---

**Last Updated**: 2026-02-16
