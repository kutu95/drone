# How to Get a Valid DJI API Key

Your current API key is being rejected by DJI's servers. You need to obtain a valid API key from DJI's Developer Portal.

## Step-by-Step Guide

### 1. Create a DJI Developer Account
1. Visit: https://developer.dji.com/
2. Click "Sign Up" or "Log In"
3. Complete the registration process

### 2. Create an Application
1. After logging in, go to: https://developer.dji.com/policies/flight_record/
2. Click **"CREATE APP"** button
3. Select **"Open API"** as the App Type
4. Fill in the required information:
   - **App Name**: (e.g., "Flight Log Parser")
   - **Category**: Choose an appropriate category
   - **Description**: Describe your application's purpose
5. Submit the application

### 3. Activate Your App
- Check your email for an activation link
- Click the link to activate your application
- This is required before you can get an API key

### 4. Get Your API Key (SDK Key)
1. Go to your developer dashboard/user page
2. Find your application in the list
3. Look for the **"SDK Key"** or **"API Key"** field
4. Copy the API key (it will be a long string of characters)

### 5. Set the API Key
1. Add it to your `.env.local` file:
   ```
   DJI_API_KEY=your-actual-api-key-from-dji-portal
   ```
2. Make sure there are no spaces or extra characters
3. Restart your Next.js development server

## Important Notes

- The API key from the developer portal is different from any keys you might have found elsewhere
- You must create an app and activate it to get a valid API key
- The API key is tied to your developer account
- Keep your API key secure - don't commit it to version control

## Verification

After setting your API key, test it:

```bash
./dji-log-parser/dji-log "docs/DJIFlightRecord_2024-12-31_[08-40-49].txt" \
  --api-key YOUR_API_KEY_FROM_PORTAL \
  --geojson test.geojson
```

If successful, it will create `test.geojson` without errors.

## Troubleshooting

- **"Unable to fetch keychain"**: API key is invalid or not properly registered
- **"API Key is required"**: You haven't set the DJI_API_KEY environment variable
- **Network errors**: Ensure you can reach DJI's servers

## Alternative: Using Older Log Files

If you have access to flight logs from older firmware versions (version 12 and below), these don't require an API key and can be parsed directly.

