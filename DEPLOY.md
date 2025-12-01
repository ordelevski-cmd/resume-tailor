# Deploy to Render.com

## Prerequisites
- GitHub account
- Render.com account (free tier available)
- OpenAI API key

## Deployment Steps

### 1. Push Code to GitHub

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit changes
git commit -m "Prepare for Render deployment"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

### 2. Deploy on Render

1. **Login to Render.com**
   - Go to https://render.com/
   - Sign in with your GitHub account

2. **Create New Web Service**
   - Click "New +" button
   - Select "Web Service"
   - Connect your GitHub repository
   - Select the `Resume-Tailor_v1.1` repository

3. **Configure Service**
   - Render will auto-detect the `render.yaml` file
   - Review the configuration:
     - **Name**: resume-tailor
     - **Environment**: Node
     - **Build Command**: `npm install && npm run build`
     - **Start Command**: `npm start`

4. **Set Environment Variables**
   - Go to "Environment" tab
   - Add your `OPENAI_API_KEY`:
     - Key: `OPENAI_API_KEY`
     - Value: `your_actual_openai_api_key`
   
   The following are already configured in `render.yaml`:
   - `NODE_VERSION`: 20.11.0
   - `OPENAI_MODEL`: gpt-5-mini
   - `NODE_ENV`: production

5. **Deploy**
   - Click "Create Web Service"
   - Render will automatically build and deploy your app
   - Wait 3-5 minutes for the build to complete

### 3. Access Your App

Once deployment is complete:
- Your app will be available at: `https://resume-tailor.onrender.com`
- Or the custom URL shown in your Render dashboard

## Important Notes

### Free Tier Limitations
- Apps on free tier spin down after 15 minutes of inactivity
- First request after inactivity may take 30-60 seconds to wake up
- 750 hours/month of free usage

### Puppeteer on Render
Your app uses Puppeteer for PDF generation. Render supports this, but if you encounter issues:
- The app already uses `@sparticuz/chromium` which is Render-compatible
- Puppeteer is configured to use headless mode

### Updating Your App
After pushing changes to GitHub:
1. Render automatically detects changes
2. Triggers a new build and deployment
3. No manual intervention needed

## Troubleshooting

### Build Fails
- Check build logs in Render dashboard
- Verify Node version matches (20.x)
- Ensure all dependencies are in `package.json`

### App Crashes
- Check logs in Render dashboard
- Verify `OPENAI_API_KEY` is set correctly
- Check OpenAI API quota/billing

### PDF Generation Issues
- Puppeteer might need additional system dependencies
- Check if `@sparticuz/chromium` is properly installed
- Review logs for Chromium-related errors

## Alternative: Deploy Using Render Blueprint

Instead of manual setup, Render will automatically read `render.yaml`:

1. Go to https://dashboard.render.com/select-repo
2. Connect your GitHub repository
3. Render detects `render.yaml` and creates services automatically
4. Just add your `OPENAI_API_KEY` in the environment variables
5. Deploy!

## Support

For Render-specific issues, check:
- Render docs: https://render.com/docs
- Render community: https://community.render.com/
