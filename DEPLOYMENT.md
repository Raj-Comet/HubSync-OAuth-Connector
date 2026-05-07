# Deployment Guide - HubSpot OAuth Connector

## Quick Start

This project is deployable to multiple platforms:
- **Backend**: Render, Railway, Heroku, Fly.io
- **Frontend**: Vercel, Netlify, Railway

## Recommended: Render (Backend) + Vercel (Frontend)

### Step 1: Prepare GitHub Repository

1. Create new GitHub repository: `hubspot-oauth-connector`
2. Push code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/hubspot-oauth-connector.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy Backend (Render)

1. Go to https://render.com
2. Click "New+" → "Web Service"
3. Connect GitHub account
4. Select `hubspot-oauth-connector` repository
5. Configure:
   - **Name**: `hubspot-oauth-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free tier is fine
6. Add Environment Variables:
   ```
   HUBSPOT_CLIENT_ID=your_client_id
   HUBSPOT_CLIENT_SECRET=your_client_secret
   STATE_SECRET=randomly_generated_secret_key
   FRONTEND_URL=https://your-frontend.vercel.app
   BACKEND_URL=https://your-backend.onrender.com
   NODE_ENV=production
   ```
7. Click "Create Web Service"
8. Wait for deployment (2-3 minutes)
9. Copy the URL (e.g., `https://hubspot-oauth-backend.onrender.com`)

### Step 3: Deploy Frontend (Vercel)

1. Go to https://vercel.com
2. Click "Add New..." → "Project"
3. Import GitHub repository
4. Configure:
   - **Framework**: Vite
   - **Build Command**: `cd frontend && npm run build`
   - **Output Directory**: `frontend/dist`
   - **Root Directory**: `.` (leave default)
5. Add Environment Variables:
   ```
   VITE_BACKEND_URL=https://your-backend.onrender.com
   ```
6. Click "Deploy"
7. Wait for deployment (1-2 minutes)
8. Copy the URL (e.g., `https://hubspot-oauth-frontend.vercel.app`)

### Step 4: Configure HubSpot Private App

1. Go to https://app.hubspot.com → Settings → Private apps
2. Click your private app
3. Update **Redirect URI**:
   ```
   https://your-backend.onrender.com/callback
   ```
4. Save changes

### Step 5: Test Production Flow

1. Visit frontend URL: `https://your-frontend.vercel.app`
2. Click "Connect HubSpot"
3. Authorize the app
4. Verify callback redirects and shows userId
5. Click "Get Contacts" and verify contacts load

## Environment Variables Reference

### Backend (.env)
```
HUBSPOT_CLIENT_ID=your_hubspot_client_id
HUBSPOT_CLIENT_SECRET=your_hubspot_client_secret
STATE_SECRET=use_openssl_rand_hex_32
FRONTEND_URL=https://your-frontend.vercel.app
BACKEND_URL=https://your-backend.onrender.com
PORT=3001
NODE_ENV=production
```

Generate `STATE_SECRET`:
```bash
openssl rand -hex 32
```

### Frontend (.env)
```
VITE_BACKEND_URL=https://your-backend.onrender.com
```

## Alternative Deployment Targets

### Backend: Railway
1. https://railway.app → New Project → Deploy from GitHub
2. Select repository
3. Add environment variables (same as above)
4. Railway auto-detects Node.js and deploys

### Backend: Fly.io
1. https://fly.io → Sign up
2. `npm install -g flyctl`
3. In backend directory: `flyctl launch`
4. Follow prompts, add env vars
5. `flyctl deploy`

### Frontend: Netlify
1. https://netlify.com → Add new site → Import from Git
2. Select repository
3. Build command: `cd frontend && npm run build`
4. Publish directory: `frontend/dist`
5. Add env vars and deploy

## Monitoring & Logs

### Backend (Render)
- Dashboard → your service → Logs tab
- View real-time logs including structured JSON

### Frontend (Vercel)
- Dashboard → your project → Deployments
- Click deployment → Logs tab

## Troubleshooting Deployment

### Backend won't start
- Check logs: `Build Command` and `Start Command` correct?
- Verify env variables set
- Ensure `backend/package.json` has all dependencies

### Frontend shows blank page
- Check browser console for errors
- Verify `VITE_BACKEND_URL` is set correctly
- Ensure backend is running and accessible

### OAuth callback fails
- Verify Redirect URI matches backend URL in HubSpot settings
- Check backend logs for state validation errors
- Ensure STATE_SECRET is same on production

### CORS errors
- Backend allows all origins (using `cors()`)
- If frontend needs specific domain, add to backend CORS config

## Cost Analysis

**Free Tier Limits:**
- **Render**: 2 free services (1 backend, 1 frontend)
- **Vercel**: Unlimited free projects, 100 GB bandwidth/month
- **Railway**: $5/month free credits (enough for this app)
- **Fly.io**: 3 shared-cpu-1x 256MB VMs free

**Estimated Monthly Cost**: $0-5 on free tier

## Scaling Considerations

As usage grows:
1. Upgrade to paid tiers for guaranteed uptime
2. Replace in-memory token store with Redis
3. Add database for persistent user data
4. Implement caching layer (Cloudflare, Redis)
5. Add CDN for frontend assets
6. Setup monitoring (Sentry, DataDog)
7. Enable auto-scaling

## Next Deployment: CI/CD Pipeline

For production teams, add GitHub Actions:

```yaml
name: Deploy to Production
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Render
        run: curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}
      - name: Deploy to Vercel
        run: vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
```

This auto-deploys on every push to main branch.
