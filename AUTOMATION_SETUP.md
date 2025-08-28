# Automated Build and Release Setup

This document explains how to set up the automated GitHub Actions workflow for building, signing, notarizing, and releasing the Roon Random Album app.

## Prerequisites

### 1. Apple Developer Account
You need an active Apple Developer Account ($99/year) with:
- **Developer ID Application Certificate** - for code signing apps distributed outside the Mac App Store
- **App-specific password** - for notarization

### 2. Required Apple Developer Information
Gather these details from your Apple Developer account:
- **Apple ID** (your developer account email)
- **Team ID** (10-character alphanumeric, found in Apple Developer Portal)
- **Developer ID Application Certificate** (exported as .p12 file)

## Setup Steps

### Step 1: Export Your Code Signing Certificate

1. Open **Keychain Access** on your Mac
2. Find your "Developer ID Application: Your Name" certificate
3. Right-click and select "Export Developer ID Application: Your Name"
4. Choose **Personal Information Exchange (.p12)** format
5. Set a strong password and save the file
6. Convert the .p12 file to base64:
   ```bash
   base64 -i /path/to/your/certificate.p12 | pbcopy
   ```
   This copies the base64 string to your clipboard.

### Step 2: Create App-Specific Password

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in with your Apple ID
3. In **Security** section, find "App-Specific Passwords"
4. Click **Generate Password**
5. Enter a label like "Roon Random Album Notarization"
6. Save the generated password (format: xxxx-xxxx-xxxx-xxxx)

### Step 3: Find Your Team ID

1. Go to [Apple Developer Portal](https://developer.apple.com)
2. Sign in and go to **Account**
3. In **Membership Details**, find your **Team ID** (10 characters)

### Step 4: Add GitHub Repository Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret** and add each of the following:

| Secret Name | Value | Description |
|-------------|--------|-------------|
| `APPLE_CERTIFICATES` | (base64 string from Step 1) | Your code signing certificate |
| `APPLE_CERTIFICATES_PASSWORD` | (password from Step 1) | Password for your .p12 file |
| `APPLE_ID` | your-apple-id@email.com | Your Apple Developer account email |
| `APPLE_ID_PASSWORD` | xxxx-xxxx-xxxx-xxxx | App-specific password from Step 2 |
| `APPLE_TEAM_ID` | XXXXXXXXXX | Your 10-character Team ID from Step 3 |

**Important**: 
- Keep these secrets secure and never commit them to your repository
- Use the exact secret names shown above (case-sensitive)
- Double-check that the base64 certificate string doesn't contain line breaks

## How to Release

### Method 1: Tag-Based Release (Recommended)

This is the simplest method - just push a version tag:

```bash
# Update version in package.json if desired (optional)
npm version 1.0.4 --no-git-tag-version

# Commit any changes
git add .
git commit -m "Prepare release 1.0.4"

# Create and push the version tag
git tag v1.0.4
git push --tags
```

The GitHub Actions workflow will automatically:
1. Build the app for both Intel and ARM64
2. Sign and notarize with Apple
3. Create a GitHub release with release notes
4. Upload the signed DMG and ZIP files

### Method 2: Manual Trigger

If you need more control, you can manually trigger a release:

1. Go to **Actions** tab in your GitHub repository
2. Select **Build and Release** workflow
3. Click **Run workflow**
4. Enter the version number (e.g., "1.0.4")
5. Click **Run workflow**

## What the Automation Does

The GitHub Actions workflow performs these steps:

1. **Setup**: Checkout code, setup Node.js, install dependencies
2. **Quality**: Run ESLint to check code quality
3. **Version**: Set version from tag or manual input
4. **Certificates**: Import your code signing certificates securely
5. **Build**: Run `npm run make` to build both Intel and ARM64 versions
6. **Sign & Notarize**: Automatically sign and notarize with Apple
7. **Release**: Create GitHub release with proper release notes
8. **Upload**: Attach signed DMG and ZIP files to the release

## Build Artifacts

Each release creates these files:
- `Roon-Random-Album-X.X.X-arm64.dmg` - Apple Silicon installer
- `Roon-Random-Album-X.X.X-x64.dmg` - Intel Mac installer  
- `Roon-Random-Album-X.X.X-arm64.zip` - Apple Silicon archive
- `Roon-Random-Album-X.X.X-x64.zip` - Intel Mac archive

## Troubleshooting

### Build Fails with Certificate Issues
- Verify your `APPLE_CERTIFICATES` secret is valid base64
- Check that `APPLE_CERTIFICATES_PASSWORD` matches your .p12 password
- Ensure your certificate is a "Developer ID Application" certificate

### Notarization Fails
- Verify `APPLE_ID` is correct
- Check that `APPLE_ID_PASSWORD` is an app-specific password (not your regular password)
- Confirm `APPLE_TEAM_ID` matches your Apple Developer Team ID

### No GitHub Release Created
- Check that you have "Contents: write" permission on the repository
- Verify the workflow completed all previous steps successfully
- Look at the GitHub Actions logs for specific error messages

### Wrong Architecture Built
- The workflow builds both Intel (x64) and ARM64 architectures automatically
- If only one architecture is built, check the forge configuration

## Security Notes

- All secrets are encrypted by GitHub and never exposed in logs
- Code signing certificates are only used during the build process
- The workflow only runs on the main repository (not forks)
- Signing only happens when the `CI` environment variable is set

## Local Development

For local development, the signing and notarization are automatically disabled:
```bash
npm run make  # Builds unsigned app for local testing
npm run dev   # Runs app in development mode
```

The automation only activates when running in GitHub Actions (when `CI=true`).