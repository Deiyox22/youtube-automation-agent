const { google } = require('googleapis');

// Builds an OAuth2 client from a channel's own stored tokens, against the
// shared OAuth app (YOUTUBE_CLIENT_ID/SECRET) — one Google Cloud OAuth
// client can mint tokens for any number of separate Google accounts/channels.
async function buildChannelOAuthClient(db, credentials, channelId) {
  const channel = await db.getChannelById(channelId);
  if (!channel) throw new Error(`Channel ${channelId} not found`);
  if (!channel.youtubeTokens?.refresh_token) {
    const error = new Error(`Channel "${channel.name}" is not connected to YouTube`);
    error.status = 409;
    throw error;
  }
  const config = credentials.getYouTubeOAuthConfig();
  if (!config) throw new Error('YouTube OAuth is not configured (YOUTUBE_CLIENT_ID/SECRET/REDIRECT_URI)');
  const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
  oauth2Client.setCredentials(channel.youtubeTokens);
  return oauth2Client;
}

// Resolves a fresh YouTube Data API client for a channel, or falls back to
// a legacy pre-multi-channel client when no channelId is given.
async function getYouTubeClientForChannel(db, credentials, channelId, legacyClient = null) {
  if (!channelId) {
    if (!legacyClient) throw new Error('No YouTube connection is configured for this content (no channel and no legacy fallback)');
    return legacyClient;
  }
  const auth = await buildChannelOAuthClient(db, credentials, channelId);
  return google.youtube({ version: 'v3', auth });
}

// Same as above for the YouTube Analytics API.
async function getYouTubeAnalyticsClientForChannel(db, credentials, channelId, legacyClient = null) {
  if (!channelId) {
    if (!legacyClient) throw new Error('No YouTube Analytics connection is configured for this content (no channel and no legacy fallback)');
    return legacyClient;
  }
  const auth = await buildChannelOAuthClient(db, credentials, channelId);
  return google.youtubeAnalytics({ version: 'v2', auth });
}

function channelHasYouTubeScope(channel, scope) {
  const granted = String(channel?.youtubeTokens?.scope || '');
  return granted.split(/\s+/).includes(scope);
}

// Strips OAuth tokens from a channel row before it reaches an API response
// or an AI prompt — the raw row from db.getChannelById() carries them.
function sanitizeChannel(channel) {
  if (!channel) return channel;
  const { youtubeTokens, youtube_tokens: _youtubeTokensRaw, ...safe } = channel;
  return { ...safe, youtubeConnected: Boolean(youtubeTokens?.refresh_token) };
}

module.exports = {
  getYouTubeClientForChannel,
  getYouTubeAnalyticsClientForChannel,
  channelHasYouTubeScope,
  sanitizeChannel
};
