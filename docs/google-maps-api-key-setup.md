# Google Maps API Key Setup

## Fixing "RefererNotAllowedMapError"

If you're getting this error, you need to add your localhost URL to the API key's referrer restrictions.

### Steps to Fix:

1. **Go to Google Cloud Console**:
   - Visit: https://console.cloud.google.com/
   - Navigate to "APIs & Services" → "Credentials"

2. **Find Your API Key**:
   - Look for the API key you're using (check your `.env.local` file for `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)

3. **Edit API Key Restrictions**:
   - Click on the API key to edit it
   - Under "Application restrictions", select **"HTTP referrers (web sites)"**
   - In the "Website restrictions" section, click "ADD AN ITEM" and add:
     ```
     http://localhost:3000/*
     http://localhost:3001/*
     http://localhost:*
     ```
   
   Or for development, you can use a wildcard:
     ```
     http://localhost:*
     ```

4. **Save the Changes**:
   - Click "SAVE"
   - Wait a few minutes for changes to propagate (usually instant, but can take up to 5 minutes)

5. **Restart Your Dev Server**:
   ```bash
   npm run dev
   ```

### For Production:

When deploying to production (e.g., Vercel), add your production domain:
```
https://your-domain.com/*
https://*.vercel.app/*
```

### Alternative: Remove Restrictions (Not Recommended)

You can remove all restrictions for development, but this is **not recommended** as it's a security risk. Only do this for testing.

## Getting a Google Maps API Key

If you don't have a Google Maps API key yet:

1. Go to: https://console.cloud.google.com/
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Maps JavaScript API
   - Places API (if needed)
   - Geocoding API (if needed)
4. Go to "Credentials" → "Create Credentials" → "API Key"
5. Copy the API key
6. Add it to your `.env.local` file:
   ```
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-api-key-here
   ```
7. Restart your dev server

## Important Notes

- API keys are sensitive - never commit them to version control
- Always use environment variables for API keys
- `.env.local` is already in `.gitignore`
- For production, use environment variables in your hosting platform (Vercel, etc.)


