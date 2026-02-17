# GitHub & Vercel Setup Guide

## Step 1: Create GitHub Repository

### Option A: Using GitHub Website (Easiest)

1. Go to https://github.com/new
2. Fill in repository details:
   - **Repository name**: `plan-check` (or your preferred name)
   - **Description**: "Media planning and ad performance tracking application"
   - **Visibility**:
     - ✅ **Private** (Recommended - keeps your code private)
     - ⚠️ Public (only if you want it open source)
   - **DO NOT** initialize with README, .gitignore, or license (you already have these)
3. Click "Create repository"

### Option B: Using GitHub CLI (If you have it installed)

```bash
gh repo create plan-check --private --source=. --remote=origin
```

---

## Step 2: Connect Your Local Project to GitHub

After creating the repository, GitHub will show you commands. Use these:

```bash
# Navigate to your project (if not already there)
cd /Users/cambrewitt/plan-check

# Check current git status
git status

# Add all your security changes
git add .

# Commit the security improvements
git commit -m "Security audit complete - production ready

- Add authentication middleware
- Configure security headers
- Implement webhook verification
- Remove secret exposure from logs
- Add deployment documentation
- Clean up unused funnel pages

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Add GitHub as remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/plan-check.git

# Push to GitHub
git push -u origin main
```

**If you get an error about 'main' vs 'master':**
```bash
# Check your current branch
git branch

# If it says 'master', rename it to 'main'
git branch -M main

# Then push
git push -u origin main
```

---

## Step 3: Connect Vercel to GitHub

### 3.1: Import Project to Vercel

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. You'll see options:
   - **GitHub** ← Click this
   - GitLab
   - Bitbucket

4. **First time?** Vercel will ask to connect to GitHub:
   - Click "Continue with GitHub"
   - Authorize Vercel to access your GitHub account
   - Choose which repositories Vercel can access:
     - ✅ **Only select repositories** (Recommended - select just `plan-check`)
     - OR "All repositories"

5. **Repository List**: You should now see your `plan-check` repository
   - Click "Import" next to it

### 3.2: Configure Project Settings

Vercel will show you project settings:

1. **Project Name**: `plan-check` (or customize)
2. **Framework Preset**: Should auto-detect as "Next.js" ✓
3. **Root Directory**: `./` (leave as default)
4. **Build Command**: `npm run build` (leave as default)
5. **Output Directory**: `.next` (leave as default)
6. **Install Command**: `npm install` (leave as default)

**Don't click Deploy yet!** First, add environment variables.

---

## Step 4: Add Environment Variables in Vercel

### 4.1: Open Environment Variables Section

On the configuration page, scroll down to **"Environment Variables"**

### 4.2: Add Each Variable

For each variable below, click "Add" and enter:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Nango Integration
NANGO_SECRET_KEY_DEV_PLAN_CHECK=your-nango-secret-key
NEXT_PUBLIC_NANGO_PUBLIC_KEY=your-nango-public-key

# Google Ads API
GOOGLE_ADS_DEVELOPER_TOKEN=your-google-ads-developer-token
GOOGLE_ADS_MCC_ID=your-mcc-id

# Webhook Security (generate a random string)
WEBHOOK_SECRET=your-webhook-secret-32-characters

# Node Environment
NODE_ENV=production
```

**Where to find these values:**

1. **Supabase**: https://app.supabase.com/project/_/settings/api
   - URL: Look for "Project URL"
   - Anon Key: Look for "anon public"
   - Service Role Key: Look for "service_role" (⚠️ Keep this SECRET!)

2. **Nango**: https://app.nango.dev
   - Navigate to your project settings
   - Copy both Secret Key and Public Key

3. **Google Ads**: From your Google Ads developer account

4. **Webhook Secret**: Generate a random string:
   ```bash
   openssl rand -hex 32
   ```
   Or use: https://www.random.org/strings/

**Important**:
- For "Environment": Select **"Production, Preview, and Development"** for all variables
- Click "Add" after each one

### 4.3: Verify All Variables Are Added

Double-check you have all 9 variables added before deploying.

---

## Step 5: Deploy!

1. Click **"Deploy"** button
2. Vercel will:
   - Install dependencies (~2-3 minutes)
   - Build your application (~2-3 minutes)
   - Deploy to production (~30 seconds)

3. **Watch the logs**: You'll see real-time build output
   - ✓ Installing dependencies
   - ✓ Building application
   - ✓ Deploying

4. **Success!** You'll see:
   - 🎉 Congratulations message
   - Your production URL: `https://plan-check-xxx.vercel.app`
   - Preview image of your app

---

## Step 6: Get Your Deployment URL

After deployment:

1. Click "Visit" or copy the URL shown
2. Your URL will be: `https://plan-check-[random].vercel.app`
3. **Optional**: Add a custom domain later in Project Settings → Domains

---

## Step 7: Configure Post-Deployment Settings

### 7.1: Update Nango Webhook URL

1. Go to https://app.nango.dev
2. Navigate to your project settings
3. Find "Webhooks" section
4. Set webhook URL to: `https://your-vercel-domain.vercel.app/api/nango/webhook`
5. Save

### 7.2: Update OAuth Redirect URLs

#### Google Ads OAuth:
1. Go to https://console.cloud.google.com
2. APIs & Services → Credentials
3. Click your OAuth 2.0 Client ID
4. Under "Authorized redirect URIs", add:
   - `https://your-vercel-domain.vercel.app/api/nango/callback`
   - `https://api.nango.dev/oauth/callback`
5. Save

#### Meta Ads OAuth:
1. Go to https://developers.facebook.com
2. Your App → Settings → Basic
3. Add App Domain: `your-vercel-domain.vercel.app`
4. Settings → Advanced → OAuth Settings
5. Add redirect URI: `https://api.nango.dev/oauth/callback`
6. Save

### 7.3: Update Supabase Site URL

1. Go to https://app.supabase.com
2. Your Project → Authentication → URL Configuration
3. Set Site URL: `https://your-vercel-domain.vercel.app`
4. Add to Redirect URLs: `https://your-vercel-domain.vercel.app/auth/callback`
5. Save

---

## Step 8: Test Your Deployment

1. **Visit your Vercel URL**
2. **Test authentication**:
   - Try to access `/dashboard` (should redirect to login)
   - Sign up for a new account
   - Log in
   - Log out

3. **Test from work computer** (tomorrow):
   - Access your Vercel URL from work
   - Verify everything loads

---

## Step 9: Set Up Supabase RLS (CRITICAL!)

**⚠️ DO THIS BEFORE CONNECTING REAL ACCOUNTS**

1. Go to https://app.supabase.com
2. Your Project → SQL Editor
3. Copy and run the RLS policies from `DEPLOYMENT.md` Step 5

See the **"Supabase RLS Policies"** section below for the exact SQL commands.

---

## Common Issues & Solutions

### Issue: "Repository not found"
**Solution**: Make sure you authorized Vercel to access your GitHub repository. Go to GitHub Settings → Applications → Vercel → Configure and grant access.

### Issue: "Build failed"
**Solution**: Check build logs in Vercel dashboard. Common causes:
- Missing environment variables
- TypeScript errors (run `npm run build` locally first)

### Issue: "Environment variable not working"
**Solution**:
- Make sure `NEXT_PUBLIC_*` variables are spelled exactly right
- Redeploy after adding variables (Vercel → Deployments → "..." → Redeploy)

### Issue: "Can't log in"
**Solution**: Check Supabase Site URL matches your Vercel domain

### Issue: "OAuth redirect errors"
**Solution**: Verify redirect URLs in Google/Meta match your Vercel domain exactly

---

## Automatic Deployments

Now that GitHub is connected:

1. **Any push to `main` branch** → Auto-deploys to production
2. **Pull requests** → Auto-creates preview deployments
3. **Local development** → No automatic deployment

**Future workflow:**
```bash
# Make changes locally
git add .
git commit -m "Add new feature"
git push

# Vercel automatically deploys!
# Check status at https://vercel.com/dashboard
```

---

## Supabase RLS Policies (Run These!)

```sql
-- Enable RLS on all tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_media_plan_builder ENABLE ROW LEVEL SECURITY;

-- Clients: Users can only see their own clients
CREATE POLICY "Users can manage own clients"
ON clients FOR ALL
USING (auth.uid() = user_id);

-- Media Plans: Users can only see plans for their clients
CREATE POLICY "Users can manage own media plans"
ON media_plans FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = media_plans.client_id
    AND clients.user_id = auth.uid()
  )
);

-- Channels: Users can only see channels for their plans
CREATE POLICY "Users can manage own channels"
ON channels FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = channels.client_id
    AND clients.user_id = auth.uid()
  )
);

-- Weekly Plans: Users can only see weekly plans for their channels
CREATE POLICY "Users can manage own weekly plans"
ON weekly_plans FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM channels
    JOIN clients ON clients.id = channels.client_id
    WHERE channels.id = weekly_plans.channel_id
    AND clients.user_id = auth.uid()
  )
);

-- Ad Platform Connections: Users can only see their own connections
CREATE POLICY "Users can manage own connections"
ON ad_platform_connections FOR ALL
USING (auth.uid() = user_id);

-- Google Ads Accounts: Users can only see their own accounts
CREATE POLICY "Users can manage own google ads accounts"
ON google_ads_accounts FOR ALL
USING (auth.uid() = user_id);

-- Meta Ads Accounts: Users can only see their own accounts
CREATE POLICY "Users can manage own meta ads accounts"
ON meta_ads_accounts FOR ALL
USING (auth.uid() = user_id);

-- Media Plan Builder: Users can only see their own builder data
CREATE POLICY "Users can manage own plan builder data"
ON client_media_plan_builder FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = client_media_plan_builder.client_id
    AND clients.user_id = auth.uid()
  )
);
```

---

## Next Steps After Deployment

- ✅ Deployment complete
- ✅ Environment variables set
- ✅ OAuth redirects configured
- ✅ Supabase RLS enabled
- ✅ Test with dummy accounts
- ⏳ Ready for real data (once tested!)

**Questions?** Check the troubleshooting section in `DEPLOYMENT.md` or Vercel's documentation.

---

**Last Updated**: 2026-02-16
