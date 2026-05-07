# QUICK START - Deploy in 10 Minutes

Follow these steps to go from zero to live production in under 10 minutes.

## Step 1: Create GitHub Repository (2 min)

1. Go to https://github.com/new
2. Repository name: `hubspot-oauth-connector`
3. Description: "Production HubSpot OAuth connector with token refresh"
4. Public repository (for portfolio)
5. Click "Create repository"

## Step 2: Push Code to GitHub (2 min)

```bash
cd "e:\HubSync OAuth Connector"
git remote add origin https://github.com/YOUR_USERNAME/hubspot-oauth-connector.git
git branch -M main
git push -u origin main
```

Verify: Visit https://github.com/YOUR_USERNAME/hubspot-oauth-connector and see all files

## Step 3: Deploy Backend (3 min)

1. Go to https://render.com and sign up with GitHub
2. Click "New +" → "Web Service"
3. Connect your GitHub account and select `hubspot-oauth-connector`
4. Configure:
   - **Name**: `hubspot-oauth-backend`
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Click "Create Web Service"
6. Wait for deployment (2-3 min)
7. Copy your Backend URL (e.g., `https://hubspot-oauth-backend.onrender.com`)

## Step 4: Deploy Frontend (2 min)

1. Go to https://vercel.com and sign up with GitHub
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Select root directory: `.` (current)
5. Framework: `Other`
6. Build settings:
   - Build Command: `cd frontend && npm run build`
   - Output Directory: `frontend/dist`
7. Environment variables:
   ```
   VITE_BACKEND_URL=https://your-backend-url-from-step-3
   ```
8. Click "Deploy"
9. Wait for deployment (1-2 min)
10. Copy your Frontend URL (e.g., `https://hubspot-oauth-frontend.vercel.app`)

## Step 5: Configure HubSpot OAuth (1 min)

1. Go to https://app.hubspot.com/l/app-marketplace/4940308
   - If not there: Settings → Private apps → Your app
2. Click your private app
3. Update "Redirect URIs" to:
   ```
   https://your-backend-url-from-step-3/callback
   ```
   (e.g., `https://hubspot-oauth-backend.onrender.com/callback`)
4. Save

## Step 6: Test Production (2 min)

1. Visit: `https://your-frontend-url-from-step-4`
2. Click "Connect HubSpot"
3. Login and authorize
4. Click "Get Contacts"
5. See real contacts from your HubSpot account ✅

## Done! 🎉

Your app is now live and production-ready.

### Deliverables Ready:

✅ Public GitHub repo: https://github.com/YOUR_USERNAME/hubspot-oauth-connector  
✅ Live frontend: Your Vercel URL  
✅ Live backend: Your Render URL  
✅ Full documentation: See README.md in repo  
✅ Architecture details: See ARCHITECTURE.md  
✅ Deployment guide: See DEPLOYMENT.md  

### Next: Record Loom Video

Record a 3-minute video showing:

1. **OAuth Flow** (30 seconds)
   - Click "Connect HubSpot" on live URL
   - Go through HubSpot login
   - Get redirected back

2. **Fetch Contacts** (30 seconds)
   - Click "Get Contacts"
   - See real contacts render
   - Show contact details

3. **Token Refresh Demo** (60 seconds)
   - Open browser dev console
   - Connect to HubSpot again
   - Check backend logs in Render (show tokens are stored)
   - Manually set token expiry to past (show mutation)
   - Click "Get Contacts"
   - Show server logs with refresh events
   - Contacts load successfully

4. **Code Walk-through** (30 seconds)
   - Show backend code for single-flight refresh pattern
   - Show frontend error handling

### Submit

Upload your video as "unlisted" on YouTube/Loom and share the link in your submission.

---

## Troubleshooting

### Backend won't deploy
- Check Render logs: Dashboard → Your app → Logs
- Ensure `backend/package.json` exists
- Verify build command succeeds

### Frontend build fails
- Check Vercel logs: Click deployment → Logs
- Ensure `frontend/src/App.tsx` exists
- Try: `cd frontend && npm run build` locally

### OAuth callback redirect fails
- Check HubSpot Redirect URI matches exactly
- Verify backend URL is correct in Render
- Check backend logs for CORS errors

### "Cannot reach backend from frontend"
- Verify `VITE_BACKEND_URL` env var is set in Vercel
- Check `backend/.env` has correct URL for FRONTEND_URL

### Contacts don't load
- Verify token is stored by checking Render logs
- Ensure HubSpot API quota not exceeded
- Try logging out and reconnecting

---

## Time Breakdown

- **GitHub setup**: 2 min
- **Backend deployment**: 3 min
- **Frontend deployment**: 2 min
- **HubSpot config**: 1 min
- **Testing**: 2 min
- **Total**: ~10 minutes to live production 🚀

---

## Important Notes

1. **State Secret**: In production backend on Render, make sure STATE_SECRET is set to a random value:
   ```bash
   openssl rand -hex 32
   ```

2. **Keep Secrets Safe**: Never commit `.env` files, only `.env.example`

3. **Monitor Logs**: 
   - Render: Dashboard → Logs tab (see all requests)
   - Vercel: Click deployment → Logs

4. **Rate Limits**: Render free tier has limits on concurrent connections

5. **Costs**: This entire project costs $0/month on free tiers

---

## What If...

### "I need to change something after deployment"

1. Make changes locally
2. `git add .` → `git commit -m "..."` → `git push`
3. Vercel/Render auto-redeploy (2-3 min)

### "I want to add a feature"

1. Read IMPLEMENTATION.md for priority list
2. Make changes locally
3. Test: `npm run dev:backend` and `npm run dev:frontend`
4. Push to GitHub

### "Tokens are lost when backend restarts"

Expected behavior with in-memory storage. See IMPLEMENTATION.md "What I'd Build Next" for PostgreSQL solution.

### "I need to scale to 1000+ users"

See ARCHITECTURE.md "Deployment Architecture" section for scaling strategy.
