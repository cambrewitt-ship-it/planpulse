# Supabase Security Checklist

## ✅ Verify Your Supabase Security Configuration

Since you've run SQL in Supabase and the security advisor shows no errors, let's verify that everything is properly secured for work use.

---

## 🔒 Critical Security Checks

### 1. Row Level Security (RLS) - MOST IMPORTANT

Run this query in Supabase SQL Editor to check RLS status:

```sql
-- Check which tables have RLS enabled
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Expected Result:** ALL tables should show `rls_enabled = true`

#### Critical Tables That MUST Have RLS Enabled:

```sql
-- Enable RLS on all critical tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_analytics_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_media_plan_builder ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_points ENABLE ROW LEVEL SECURITY;
```

---

### 2. Check Existing RLS Policies

Run this to see what policies you have:

```sql
-- View all RLS policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**What to look for:**
- ✅ Each table should have policies that check `auth.uid() = user_id`
- ✅ Policies should cover: SELECT, INSERT, UPDATE, DELETE
- ❌ No policies = **UNSAFE** - any authenticated user can access all data

---

### 3. Required RLS Policies (Copy/Paste If Missing)

If you don't have these policies, **ADD THEM NOW**:

```sql
-- ============================================
-- CLIENTS TABLE POLICIES
-- ============================================
CREATE POLICY "Users can view own clients"
ON clients FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own clients"
ON clients FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own clients"
ON clients FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own clients"
ON clients FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- MEDIA PLANS TABLE POLICIES
-- ============================================
CREATE POLICY "Users can view own media plans"
ON media_plans FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = media_plans.client_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own media plans"
ON media_plans FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = media_plans.client_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own media plans"
ON media_plans FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = media_plans.client_id
    AND clients.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = media_plans.client_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own media plans"
ON media_plans FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = media_plans.client_id
    AND clients.user_id = auth.uid()
  )
);

-- ============================================
-- CHANNELS TABLE POLICIES
-- ============================================
CREATE POLICY "Users can view own channels"
ON channels FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = channels.client_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own channels"
ON channels FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = channels.client_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own channels"
ON channels FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = channels.client_id
    AND clients.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = channels.client_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own channels"
ON channels FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = channels.client_id
    AND clients.user_id = auth.uid()
  )
);

-- ============================================
-- WEEKLY PLANS TABLE POLICIES
-- ============================================
CREATE POLICY "Users can view own weekly plans"
ON weekly_plans FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM channels
    JOIN clients ON clients.id = channels.client_id
    WHERE channels.id = weekly_plans.channel_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own weekly plans"
ON weekly_plans FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM channels
    JOIN clients ON clients.id = channels.client_id
    WHERE channels.id = weekly_plans.channel_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own weekly plans"
ON weekly_plans FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM channels
    JOIN clients ON clients.id = channels.client_id
    WHERE channels.id = weekly_plans.channel_id
    AND clients.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM channels
    JOIN clients ON clients.id = channels.client_id
    WHERE channels.id = weekly_plans.channel_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own weekly plans"
ON weekly_plans FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM channels
    JOIN clients ON clients.id = channels.client_id
    WHERE channels.id = weekly_plans.channel_id
    AND clients.user_id = auth.uid()
  )
);

-- ============================================
-- AD PLATFORM CONNECTIONS TABLE POLICIES
-- ============================================
CREATE POLICY "Users can view own ad connections"
ON ad_platform_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ad connections"
ON ad_platform_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ad connections"
ON ad_platform_connections FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own ad connections"
ON ad_platform_connections FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- GOOGLE ADS ACCOUNTS TABLE POLICIES
-- ============================================
CREATE POLICY "Users can view own google ads accounts"
ON google_ads_accounts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own google ads accounts"
ON google_ads_accounts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own google ads accounts"
ON google_ads_accounts FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own google ads accounts"
ON google_ads_accounts FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- META ADS ACCOUNTS TABLE POLICIES
-- ============================================
CREATE POLICY "Users can view own meta ads accounts"
ON meta_ads_accounts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meta ads accounts"
ON meta_ads_accounts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meta ads accounts"
ON meta_ads_accounts FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own meta ads accounts"
ON meta_ads_accounts FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- GOOGLE ANALYTICS ACCOUNTS TABLE POLICIES
-- ============================================
CREATE POLICY "Users can view own ga4 accounts"
ON google_analytics_accounts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ga4 accounts"
ON google_analytics_accounts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ga4 accounts"
ON google_analytics_accounts FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own ga4 accounts"
ON google_analytics_accounts FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- CLIENT MEDIA PLAN BUILDER TABLE POLICIES
-- ============================================
CREATE POLICY "Users can view own media plan builder"
ON client_media_plan_builder FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = client_media_plan_builder.client_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own media plan builder"
ON client_media_plan_builder FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = client_media_plan_builder.client_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own media plan builder"
ON client_media_plan_builder FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = client_media_plan_builder.client_id
    AND clients.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = client_media_plan_builder.client_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own media plan builder"
ON client_media_plan_builder FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = client_media_plan_builder.client_id
    AND clients.user_id = auth.uid()
  )
);

-- ============================================
-- ACTION POINTS TABLE POLICIES
-- ============================================
CREATE POLICY "Users can view own action points"
ON action_points FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM channels
    JOIN clients ON clients.id = channels.client_id
    WHERE channels.id = action_points.channel_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own action points"
ON action_points FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM channels
    JOIN clients ON clients.id = channels.client_id
    WHERE channels.id = action_points.channel_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own action points"
ON action_points FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM channels
    JOIN clients ON clients.id = channels.client_id
    WHERE channels.id = action_points.channel_id
    AND clients.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM channels
    JOIN clients ON clients.id = channels.client_id
    WHERE channels.id = action_points.channel_id
    AND clients.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own action points"
ON action_points FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM channels
    JOIN clients ON clients.id = channels.client_id
    WHERE channels.id = action_points.channel_id
    AND clients.user_id = auth.uid()
  )
);
```

---

## 🧪 Test Data Isolation

After setting up RLS, **TEST IT** before using with real work data:

### Step 1: Create Two Test Users

```sql
-- In Supabase Dashboard > Authentication > Users
-- Click "Invite User" twice to create:
-- User 1: test1@example.com
-- User 2: test2@example.com
```

### Step 2: Test Data Isolation

1. **Log in as User 1**, create a test client
2. **Log in as User 2**, try to view clients
3. **Expected:** User 2 should see ZERO clients (not User 1's client)

### Step 3: SQL Test Query

Run this as a super user to verify policies work:

```sql
-- This should return empty for user_id that doesn't match
SET request.jwt.claims.sub = 'fake-user-id-12345';
SELECT * FROM clients;
-- Should return: 0 rows (if RLS is working correctly)
```

---

## ⚠️ Common Issues & Fixes

### Issue 1: "No rows returned" when logged in
**Cause:** RLS is enabled but you're testing with a user that has no data
**Fix:** Create test data while logged in as that user

### Issue 2: Existing data not visible after enabling RLS
**Cause:** Old data has NULL user_id
**Fix:** Update existing data:
```sql
-- ONLY run if you have existing test data
UPDATE clients SET user_id = auth.uid() WHERE user_id IS NULL;
UPDATE ad_platform_connections SET user_id = auth.uid() WHERE user_id IS NULL;
-- etc for other tables
```

### Issue 3: Can't insert data
**Cause:** INSERT policy missing or incorrect
**Fix:** Make sure you have both `FOR INSERT` policies with `WITH CHECK`

---

## ✅ Final Security Checklist

Before connecting work social media accounts:

- [ ] All tables have RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] All tables have SELECT, INSERT, UPDATE, DELETE policies
- [ ] Policies check `auth.uid() = user_id` or equivalent
- [ ] Tested with two different user accounts
- [ ] Verified User A cannot see User B's data
- [ ] Supabase Security Advisor shows no errors/warnings
- [ ] All tables have proper indexes (for performance)
- [ ] Service role key is stored securely in Vercel (never in code)

---

## 🚨 Red Flags - DO NOT DEPLOY IF:

- ❌ Any table shows `rls_enabled = false`
- ❌ No policies exist for a table with user data
- ❌ Policies don't check `auth.uid()`
- ❌ You can see other test users' data
- ❌ Security Advisor shows warnings about RLS

---

## 📞 Need Help?

If you're unsure about any of these checks:
1. **Don't connect real work accounts yet**
2. Run the verification queries above
3. Share the results (remove any sensitive data first)
4. We can review together before you proceed

---

**Last Updated:** 2026-02-16
