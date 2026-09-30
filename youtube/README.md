# Nova YouTube Automation

Nova's YouTube layer is designed for Android/Termux and stays inside the existing
Nova tool registry.

## GitHub sources used for the design

- TermuxTube: mobile video creation, FFmpeg processing, metadata and YouTube upload workflow.
- youtube-upload-sync: OAuth upload, resumable uploads, duplicate-aware local state and private-by-default publishing.

Nova does not copy either project wholesale.

## Capabilities

- Check YouTube/OAuth readiness.
- Check the authenticated channel.
- Create a lightweight local MP4 project with FFmpeg.
- Generate a local metadata package (title, description, tags, privacy).
- Upload a prepared video through YouTube Data API v3 OAuth.
- Keep uploads behind Nova's existing high-impact approval gate.

## Important platform boundary

The YouTube Data API does not provide a general API operation for creating a
new YouTube channel. Nova therefore does not pretend to create channels.
A Google account/channel must exist first. The first OAuth authorization is
interactive; after consent, the token can be reused locally.

## Android setup

1. Put your Google OAuth desktop-client JSON at:
   `~/Nova/youtube/client_secret.json`
2. Install the optional uploader dependencies from `requirements-youtube.txt`.
3. Start Nova and ask for YouTube status/channel status.
4. The first upload opens the OAuth consent flow.
5. Uploads default to **private** and require Nova approval before execution.

Never commit `client_secret.json` or `token.json`.
