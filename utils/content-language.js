// Channel content language: what the AI agents write scripts, titles,
// descriptions, tags, and comment replies in. Distinct from the dashboard
// UI language (always French) — this is the language of the videos the
// channel publishes.

const LANGUAGE_NAMES = {
  fr: 'French',
  en: 'English',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch'
};

const DEFAULT_LANGUAGE = 'fr';

function isSupportedLanguage(code) {
  return Object.prototype.hasOwnProperty.call(LANGUAGE_NAMES, code);
}

function languageName(code) {
  return LANGUAGE_NAMES[code] || LANGUAGE_NAMES[DEFAULT_LANGUAGE];
}

// Pass the channel this content belongs to when known (multi-channel):
// its own content_language wins. Falls back to the legacy single-profile
// setting only when no channelId is given (pre-multi-channel call sites).
async function getContentLanguage(db, channelId) {
  try {
    const profile = channelId ? await db.getChannelById(channelId) : await db.getChannelProfile();
    const code = profile?.content_language;
    return isSupportedLanguage(code) ? code : DEFAULT_LANGUAGE;
  } catch (_error) {
    return DEFAULT_LANGUAGE;
  }
}

function languageInstruction(code) {
  return `Write every piece of user-facing text you produce (titles, hooks, scripts, descriptions, tags, on-screen text, replies, theme summaries) entirely in ${languageName(code)}. Do not mix languages, even for section labels or examples.`;
}

module.exports = {
  LANGUAGE_NAMES,
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  languageName,
  getContentLanguage,
  languageInstruction
};
