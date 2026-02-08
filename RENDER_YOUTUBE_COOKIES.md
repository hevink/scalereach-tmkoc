# YouTube Cookies Setup for Render.com

## Problem
YouTube cookies file needs to be available in production but shouldn't be committed to the repository.

## Solution: Use Render Secret Files

### Step 1: Export YouTube Cookies Locally

Follow the instructions in `YOUTUBE_COOKIES_SETUP.md` to export your YouTube cookies to a file.

### Step 2: Upload Cookies as Secret File on Render

1. Go to your Render Dashboard
2. Select your service (scalereach-api or scalereach-worker)
3. Go to "Environment" tab
4. Scroll down to "Secret Files" section
5. Click "Add Secret File"
6. Configure:
   - **Filename**: `/app/config/youtube_cookies.txt`
   - **Contents**: Paste the entire contents of your `youtube_cookies.txt` file
7. Click "Save Changes"

### Step 3: Set Environment Variable

In the Render Dashboard, add the environment variable:

- **Key**: `YOUTUBE_COOKIES_PATH`
- **Value**: `/app/config/youtube_cookies.txt`

Or update it in the Render Dashboard to match the secret file path.

### Step 4: Repeat for Worker Service

The worker service also needs YouTube cookies for clip generation:

1. Go to "scalereach-worker" service
2. Add the same secret file: `/app/config/youtube_cookies.txt`
3. Add the same environment variable: `YOUTUBE_COOKIES_PATH=/app/config/youtube_cookies.txt`

### Step 5: Deploy

After adding the secret file and environment variable, trigger a new deployment.

---

## Alternative: Build-time Cookie Injection

If you prefer to bake cookies into the Docker image (less secure):

### Update Dockerfile

Add before the `CMD` instruction:

```dockerfile
# Create config directory
RUN mkdir -p /app/config

# Copy YouTube cookies (if available)
COPY --chown=node:node config/youtube_cookies.txt /app/config/youtube_cookies.txt 2>/dev/null || true
```

### Build with Cookies

```bash
# Ensure cookies file exists locally
cp ~/Downloads/youtube_cookies.txt config/youtube_cookies.txt

# Build and push
docker build -t scalereach-api .
```

**Note**: This is less secure as cookies are baked into the image.

---

## Cookie Refresh Strategy

YouTube cookies typically expire after 1-2 years. Set a reminder to:

1. Export fresh cookies from your browser
2. Update the secret file on Render
3. Redeploy the services

### Monitoring

Watch for these errors in logs:
- `Sign in to confirm you're not a bot`
- `YouTube requires sign-in`

These indicate expired cookies.

---

## Security Best Practices

1. **Use a dedicated Google account** for production (not your personal account)
2. **Rotate cookies regularly** (every 6 months recommended)
3. **Monitor for authentication errors** in your logging system
4. **Never commit cookies to git** (already in .gitignore)
5. **Use Render's Secret Files** instead of environment variables for the cookie content

---

## Troubleshooting

### Error: "No such file or directory"

The secret file path doesn't match the environment variable:
- Check that `YOUTUBE_COOKIES_PATH` matches the secret file path
- Ensure the secret file is uploaded to both API and Worker services

### Error: "Cookies are invalid"

Cookies have expired:
1. Export fresh cookies from your browser
2. Update the secret file on Render
3. Redeploy

### Worker can't download videos

Make sure the worker service also has:
- The YouTube cookies secret file
- The `YOUTUBE_COOKIES_PATH` environment variable

---

## Summary

✅ Export YouTube cookies locally
✅ Upload as Secret File on Render: `/app/config/youtube_cookies.txt`
✅ Set `YOUTUBE_COOKIES_PATH=/app/config/youtube_cookies.txt` in both API and Worker
✅ Deploy and test
✅ Set reminder to refresh cookies in 6 months
