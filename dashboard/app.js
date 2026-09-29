const ui = {
  state: null,
  currentView: 'overview',
  refreshing: false,
  toastTimer: null,
  retentionSnapshotId: null,
  engagementVideoId: null,
  engagementDetail: null,
  activeChannelId: (() => {
    try { return localStorage.getItem('yaa_active_channel') || null; } catch { return null; }
  })()
};

function setActiveChannel(channelId) {
  ui.activeChannelId = channelId || null;
  try {
    if (channelId) localStorage.setItem('yaa_active_channel', channelId);
    else localStorage.removeItem('yaa_active_channel');
  } catch { /* private browsing / storage disabled */ }
}

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function apiKey() {
  return localStorage.getItem('yaa_api_key') || '';
}

function requestApiKey() {
  const key = prompt('Entrez la valeur API_KEY de votre fichier .env. Elle reste uniquement dans ce navigateur.', apiKey());
  if (key !== null) localStorage.setItem('yaa_api_key', key.trim());
  return key;
}

async function api(url, options = {}, retry = true) {
  const key = apiKey();
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'x-api-key': key } : {}),
      ...(options.headers || {})
    }
  });
  if (response.status === 401 && retry && requestApiKey() !== null) return api(url, options, false);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || response.statusText || 'Échec de la requête');
    error.data = data;
    throw error;
  }
  return data;
}

function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => toast.classList.add('hidden'), 4200);
}

function empty(message) {
  return `<div class="empty">${escapeHTML(message)}</div>`;
}

function formatDate(value, includeTime = true) {
  if (!value) return 'Non planifié';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Non planifié';
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'short', day: 'numeric',
    ...(ui.state?.profile?.timezone ? { timeZone: ui.state.profile.timezone } : {}),
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {})
  }).format(date);
}

function timeAgo(value) {
  if (!value) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'à l’instant';
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)} h`;
  return `il y a ${Math.floor(seconds / 86400)} j`;
}

const STATUS_LABELS = {
  unknown: 'inconnu',
  needs_auth: 'authentification requise',
  queued: 'en file d’attente',
  running: 'en cours',
  failed: 'échoué',
  interrupted: 'interrompu',
  completed: 'terminé',
  completed_with_issues: 'terminé avec problèmes',
  cancelling: 'annulation en cours',
  cancelled: 'annulé',
  needs_review: 'à examiner',
  needs_attention: 'nécessite attention',
  approved: 'approuvé',
  published: 'publié',
  scheduled: 'planifié',
  rejected: 'rejeté',
  draft: 'brouillon',
  active: 'actif',
  not_configured: 'non configuré',
  pending: 'en attente',
  verified: 'vérifié',
  not_required: 'non requis',
  backlog: 'backlog',
  passed: 'réussi',
  warning: 'avertissement',
  unverified: 'non vérifié',
  positive: 'positif',
  neutral: 'neutre',
  negative: 'négatif',
  current: 'à jour',
  intentional_silence: 'silence intentionnel',
  ready: 'prêt',
  uploading: 'envoi en cours',
  uploaded: 'envoyé',
  reconciliation_required: 'réconciliation requise',
  action_required: 'action requise',
  awaiting_winner: 'en attente du gagnant',
  accepted: 'accepté',
  dismissed: 'ignoré',
  unavailable: 'indisponible',
  high: 'élevée',
  medium: 'moyenne',
  low: 'faible',
  posted: 'publié',
  discarded: 'ignoré',
  audience_demand: 'demande de l’audience',
  spam: 'spam',
  scam: 'arnaque',
  toxic: 'toxique',
  locked: 'verrouillé',
  success: 'succès',
  error: 'erreur',
  info: 'info',
  strategy: 'stratégie',
  script: 'script',
  thumbnail: 'miniature',
  seo: 'référencement',
  production: 'production',
  quality_review: 'revue qualité'
};

function label(value) {
  const raw = String(value || 'unknown');
  const mapped = STATUS_LABELS[raw.toLowerCase()];
  return mapped || raw.replaceAll('_', ' ');
}

function statusChip(value) {
  const safe = String(value || 'unknown').toLowerCase();
  return `<span class="status ${escapeHTML(safe)}">${escapeHTML(label(safe))}</span>`;
}

async function refreshDashboard(silent = false) {
  if (ui.refreshing) return;
  ui.refreshing = true;
  if (!silent) $('#loading').classList.add('active');
  try {
    const query = ui.activeChannelId ? `?channelId=${encodeURIComponent(ui.activeChannelId)}` : '';
    ui.state = await api(`/api/dashboard${query}`);
    if (!ui.activeChannelId && ui.state.channels?.length) {
      setActiveChannel(ui.state.channels[0].id);
      ui.state = await api(`/api/dashboard?channelId=${encodeURIComponent(ui.activeChannelId)}`);
    } else if (ui.activeChannelId && !ui.state.channels?.some(channel => channel.id === ui.activeChannelId)) {
      // The remembered channel was deleted elsewhere; fall back cleanly.
      setActiveChannel(ui.state.channels?.[0]?.id || null);
      const fallbackQuery = ui.activeChannelId ? `?channelId=${encodeURIComponent(ui.activeChannelId)}` : '';
      ui.state = await api(`/api/dashboard${fallbackQuery}`);
    }
    renderDashboard();
  } catch (error) {
    $('#system-label').textContent = 'Tableau de bord indisponible';
    $('#system-dot').classList.remove('online');
    if (!silent) showToast(error.message, 'error');
  } finally {
    ui.refreshing = false;
    $('#loading').classList.remove('active');
  }
}

function renderDashboard() {
  const state = ui.state;
  const reviews = state.pipeline.filter(item => ['needs_review', 'needs_attention'].includes(item.review_status));
  const scheduled = state.schedule.filter(item => item.status === 'scheduled');
  const actionableJobs = state.jobs.filter(job => ['queued', 'running', 'failed', 'interrupted'].includes(job.status));

  $('#brand-name').textContent = state.profile?.channel_name || 'Automation Studio';
  $('#setup-banner').classList.toggle('hidden', !state.system.setupRequired);
  $('#system-label').textContent = state.system.setupRequired
    ? 'Configuration requise'
    : state.system.automationPaused ? 'Automatisation en pause' : `${state.system.agents.length} agents en ligne`;
  $('#system-dot').classList.toggle('online', state.system.initialized && !state.system.automationPaused && !state.system.setupRequired);
  $('#automation-toggle').textContent = state.system.automationPaused ? 'Reprendre l’automatisation' : 'Mettre en pause l’automatisation';
  $('#automation-toggle').disabled = state.system.setupRequired;
  $('#generate-button').disabled = state.system.setupRequired;
  $('#review-badge').textContent = reviews.length;
  $('#review-badge').classList.toggle('hidden', reviews.length === 0);

  $('#stat-review').textContent = reviews.length;
  $('#stat-scheduled').textContent = scheduled.length;
  $('#stat-published').textContent = state.stats.published || 0;
  $('#stat-score').textContent = state.analytics.averagePerformanceScore ? `${state.analytics.averagePerformanceScore}/100` : '—';

  renderReviews(reviews);
  renderJobs(actionableJobs.length ? actionableJobs : state.jobs.slice(0, 5));
  renderSchedule(state.schedule.slice(0, 5), '#next-schedule');
  renderNotifications(state.notifications, state.events);
  renderPipeline(state.pipeline);
  renderCalendar(state.schedule);
  renderIdeas(state.ideas);
  renderAnalytics(state.analytics, state.learning);
  renderGrowthExperiments(state.experiments || {});
  renderEngagement(ui.state.engagement || {});
  renderActivation(state.activation);
  renderReadiness(state.readiness);
  renderOperator(state.channelStrategy, state.operatorRuns || [], { ...state.system, readiness: state.readiness });
  populateSettings(state.profile, state.settings, state.system.videoProviders || []);
  renderChannels(state.channels || []);
  renderChannelSwitcher(state.channels || []);
}

function renderChannelSwitcher(channels) {
  const select = $('#active-channel-select');
  if (!select) return;
  if (!channels.length) {
    select.innerHTML = '<option value="">Aucune chaîne</option>';
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.innerHTML = channels.map(channel => `<option value="${escapeHTML(channel.id)}" ${channel.id === ui.activeChannelId ? 'selected' : ''}>${escapeHTML(channel.youtube_channel_title || channel.name)}${channel.status !== 'active' ? ' (non connectée)' : ''}</option>`).join('');
}

const CHANNEL_LANGUAGE_LABELS = { fr: 'Français', en: 'Anglais', es: 'Espagnol', de: 'Allemand', it: 'Italien', pt: 'Portugais', nl: 'Néerlandais' };

function renderChannels(channels) {
  const container = $('#channels-list');
  if (!container) return;
  if (!channels.length) {
    container.innerHTML = empty('Aucune chaîne pour le moment. Ajoutez-en une pour commencer.');
    return;
  }
  container.innerHTML = channels.map(channel => {
    const displayName = channel.youtube_channel_title || channel.name;
    const hasStats = channel.youtube_video_count !== null && channel.youtube_video_count !== undefined;
    return `
    <article class="panel channel-card" data-channel-id="${escapeHTML(channel.id)}">
      <div class="channel-card-heading">
        <div>
          <strong>${escapeHTML(displayName)}</strong>
          ${channel.youtube_channel_title && channel.youtube_channel_title !== channel.name ? `<div class="meta-line">${escapeHTML(channel.name)}</div>` : ''}
          <div class="meta-line">${statusChip(channel.status)}</div>
        </div>
      </div>
      ${hasStats ? `<div class="channel-card-stats">
        <span><strong>${Number(channel.youtube_video_count).toLocaleString('fr-FR')}</strong> vidéos</span>
        <span><strong>${Number(channel.youtube_view_count || 0).toLocaleString('fr-FR')}</strong> vues</span>
      </div>` : ''}
      <div class="channel-card-meta">
        <span>${escapeHTML(CHANNEL_LANGUAGE_LABELS[channel.content_language] || channel.content_language || 'Français')}</span>
        <span>${escapeHTML(channel.goal || 'Aucun objectif défini')}</span>
      </div>
      <div class="channel-card-actions">
        ${channel.youtubeConnected
          ? '<span class="status success">YouTube connectée</span><button type="button" class="text-button" data-refresh-channel="' + escapeHTML(channel.id) + '">Actualiser</button>'
          : `<a class="button secondary small" href="/auth/youtube/start?channelId=${encodeURIComponent(channel.id)}">Connecter YouTube</a>`}
        <button type="button" class="text-button" data-edit-channel="${escapeHTML(channel.id)}">Modifier</button>
        <button type="button" class="text-button danger-text" data-delete-channel="${escapeHTML(channel.id)}">Supprimer</button>
      </div>
    </article>`;
  }).join('');
}

function renderReadiness(readiness = {}) {
  const status = readiness.status || 'unverified';
  const statusNode = $('#readiness-status');
  statusNode.className = `status ${escapeHTML(status)}`;
  statusNode.textContent = readiness.stale && status !== 'unverified' ? `${label(status)} · obsolète` : label(status);

  const titles = {
    passed: 'Le chemin de production est vérifié.',
    warning: 'Les vérifications essentielles ont réussi avec des avertissements.',
    failed: 'L’automatisation est bloquée tant que ce problème n’est pas résolu.',
    unverified: 'Validez le pipeline, sans publier.'
  };
  $('#readiness-title').textContent = titles[status] || titles.unverified;
  const counts = readiness.summary || {};
  $('#readiness-summary').textContent = status === 'unverified'
    ? 'La vérification effectue de petites requêtes réelles de texte et de narration, vérifie l’accès à la chaîne, construit un MP4 audio/vidéo local et valide les métadonnées en attente. Elle ne crée ni ne publie jamais de vidéo YouTube.'
    : `${counts.passed || 0} réussies, ${counts.warnings || 0} avertissement${counts.warnings === 1 ? '' : 's'}, et ${counts.failed || 0} échouées.`;
  $('#readiness-meta').textContent = readiness.completed_at
    ? `Dernière exécution ${formatDate(readiness.completed_at)}${readiness.stale ? ' · plus de 24 heures' : ''}`
    : 'Aucune vérification de préparation enregistrée.';

  const checks = Array.isArray(readiness.checks) ? readiness.checks : [];
  $('#readiness-checks').innerHTML = checks.length ? checks.map(check => `
    <article class="readiness-check ${escapeHTML(check.status)}">
      <div class="readiness-check-heading"><span class="readiness-icon" aria-hidden="true">${check.status === 'passed' ? '✓' : check.status === 'failed' ? '×' : '!'}</span><div><strong>${escapeHTML(check.label)}</strong><div class="meta-line">${escapeHTML(label(check.status))}${check.blocking ? ' · bloquant' : ' · optionnel'} · ${(check.durationMs || 0) / 1000}s</div></div></div>
      <p>${escapeHTML(check.message)}</p>
      ${check.remediation ? `<small><strong>Suivant :</strong> ${escapeHTML(check.remediation)}</small>` : ''}
    </article>`).join('') : empty('Lancez la vérification pour inspecter chaque dépendance de production.');
}

function renderReviews(reviews) {
  const container = $('#review-list');
  if (!reviews.length) {
    container.innerHTML = empty('Rien n’est en attente. Le nouveau contenu apparaîtra ici après la revue qualité.');
    return;
  }
  container.innerHTML = reviews.slice(0, 5).map(item => `
    <article class="review-card">
      ${item.hasThumbnail ? `<img class="review-thumb" src="/api/content/${encodeURIComponent(item.id)}/asset/thumbnail" alt="">` : '<div class="review-thumb"></div>'}
      <div class="review-meta"><strong>${escapeHTML(item.title)}</strong><div class="meta-line">${statusChip(item.review_status)} · Qualité ${qualityScore(item.qualityChecks)}%</div></div>
      <button class="button secondary small" data-open-content="${escapeHTML(item.id)}">Examiner</button>
    </article>`).join('');
}

function renderJobs(jobs) {
  const container = $('#job-list');
  if (!jobs.length) {
    container.innerHTML = empty('Aucune génération pour le moment.');
    return;
  }
  const stages = ['strategy', 'script', 'thumbnail', 'seo', 'production', 'quality_review'];
  container.innerHTML = jobs.slice(0, 6).map(job => {
    const checkpoints = Array.isArray(job.checkpoints) ? job.checkpoints : [];
    const completed = new Set(checkpoints.filter(item => item.status === 'completed').map(item => item.stage));
    const mediaTasks = Array.isArray(job.mediaTasks) ? job.mediaTasks : [];
    const mediaCompleted = mediaTasks.filter(item => item.status === 'succeeded').length;
    const mediaProviders = [...new Set(mediaTasks.map(item => label(item.provider)))].join(', ');
    const resumeFrom = stages.find(stage => !completed.has(stage)) || 'quality_review';
    const recoverable = ['failed', 'interrupted'].includes(job.status);
    return `
    <article class="job-card">
      <div class="job-meta">
        <strong>${escapeHTML(job.title || job.topic || 'Sujet choisi par l’agent')}</strong>
        <div class="meta-line">${statusChip(job.status)} · ${escapeHTML(label(job.stage))} · ${timeAgo(job.updated_at)}</div>
        ${checkpoints.length ? `<div class="checkpoint-line">${completed.size}/${stages.length} étapes enregistrées${job.details?.reusedStages?.length ? ` · ${job.details.reusedStages.length} réutilisée(s)` : ''}</div>` : ''}
        ${mediaTasks.length ? `<div class="checkpoint-line">Vidéo : ${mediaCompleted}/${mediaTasks.length} clips prêts · ${escapeHTML(mediaProviders)}</div>` : ''}
        <div class="progress"><i style="width:${Math.max(0, Math.min(100, job.progress || 0))}%"></i></div>
      </div>
      ${['queued', 'running'].includes(job.status) ? `<button class="text-button" data-cancel-job="${escapeHTML(job.id)}">Annuler</button>` : ''}
      ${recoverable ? `<div class="job-recovery"><select data-resume-stage-for="${escapeHTML(job.id)}" aria-label="Étape à partir de laquelle reprendre">${stages.map(stage => `<option value="${stage}" ${stage === resumeFrom ? 'selected' : ''}>${escapeHTML(label(stage))}</option>`).join('')}</select><button class="button secondary small" data-resume-job="${escapeHTML(job.id)}">Reprendre</button></div>` : ''}
    </article>`;
  }).join('');
}

function renderSchedule(schedule, selector) {
  const container = $(selector);
  if (!schedule.length) {
    container.innerHTML = empty('Aucune vidéo approuvée n’est planifiée.');
    return;
  }
  container.innerHTML = schedule.map(item => `
    <div class="timeline-item">
      <div class="date-chip"><small>${escapeHTML(new Date(item.publish_time).toLocaleDateString('fr-FR', { month: 'short' }))}</small><strong>${escapeHTML(new Date(item.publish_time).getDate())}</strong></div>
      <div class="timeline-meta"><strong>${escapeHTML(item.title)}</strong><div class="meta-line">${formatDate(item.publish_time)} · ${statusChip(item.status)}</div></div>
      <button class="text-button" data-open-content="${escapeHTML(item.production_id)}">Voir</button>
    </div>`).join('');
}

function renderNotifications(notifications, events) {
  const items = notifications.length
    ? notifications
    : events.map(event => ({ level: event.status === 'error' ? 'error' : 'info', title: label(event.event_type), message: event.data?.error || label(event.status), created_at: event.created_at }));
  const container = $('#notification-list');
  if (!items.length) {
    container.innerHTML = empty('Aucune activité n’a été enregistrée pour le moment.');
    return;
  }
  container.innerHTML = items.slice(0, 7).map(item => `
    <div class="activity ${escapeHTML(item.level || 'info')}"><i></i><p><strong>${escapeHTML(item.title)}</strong><br><span class="meta-line">${escapeHTML(item.message)}</span></p><small>${timeAgo(item.created_at)}</small></div>`).join('');
}

function currentPipelineFilter() {
  return $('#pipeline-filter').value || 'all';
}

function renderPipeline(items) {
  const filter = currentPipelineFilter();
  const filtered = filter === 'all' ? items : items.filter(item =>
    item.review_status === filter || item.schedule_status === filter || item.status === filter
  );
  const container = $('#pipeline-list');
  if (!filtered.length) {
    container.innerHTML = empty('Aucun contenu ne correspond à cette vue.');
    return;
  }
  container.innerHTML = filtered.map(item => {
    const state = item.schedule_status || item.review_status || item.status;
    const next = nextAction(item);
    return `<article class="pipeline-item" data-open-content="${escapeHTML(item.id)}">
      <div class="pipeline-title"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.topic || 'Aucun sujet enregistré')} · ${formatDate(item.created_at)}</span></div>
      <div class="pipeline-col"><span>État</span><strong>${statusChip(state)}</strong></div>
      <div class="pipeline-col"><span>Qualité</span><strong>${qualityScore(item.qualityChecks)} / 100</strong></div>
      <button class="button secondary small">${escapeHTML(next)} →</button>
    </article>`;
  }).join('');
}

function qualityScore(checks) {
  if (!Array.isArray(checks) || !checks.length) return 0;
  return Math.round((checks.filter(check => check.passed).length / checks.length) * 100);
}

function nextAction(item) {
  if (item.schedule_status === 'published') return 'Voir';
  if (item.review_status === 'needs_attention') return 'Corriger les problèmes';
  if (item.review_status === 'needs_review') return 'Examiner';
  if (item.schedule_status === 'scheduled') return 'Planifié';
  return 'Inspecter';
}

function renderCalendar(schedule) {
  renderSchedule(schedule, '#calendar-list');
}

function renderIdeas(ideas) {
  const container = $('#idea-list');
  if (!ideas.length) {
    container.innerHTML = empty('Ajoutez ici des sujets prometteurs avant de consommer des crédits de génération.');
    return;
  }
  container.innerHTML = ideas.map(idea => `
    <article class="idea-card">
      <div class="idea-meta"><strong>${escapeHTML(idea.topic)}</strong><div class="meta-line">${escapeHTML(idea.angle || idea.rationale || 'Aucun angle ajouté')} · ${statusChip(idea.status)}</div></div>
      ${idea.status === 'backlog' ? `<button class="button secondary small" data-generate-idea="${escapeHTML(idea.id)}">Générer</button>` : ''}
    </article>`).join('');
}

function renderAnalytics(analytics, learning = {}) {
  $('#analytics-total').textContent = analytics.totalVideos || 0;
  $('#analytics-score').textContent = analytics.averagePerformanceScore ? `${analytics.averagePerformanceScore}/100` : '—';
  const insights = Array.isArray(analytics.insights) ? analytics.insights : [];
  const approved = (learning.recommendations || []).find(item => item.status === 'approved');
  const pending = (learning.recommendations || []).find(item => item.status === 'pending');
  $('#analytics-action').textContent = approved?.title || pending?.title || insights[0] || (analytics.totalVideos
    ? 'Continuez à collecter des résultats ; les recommandations s’améliorent avec plus de vidéos publiées.'
    : 'Publiez et analysez la première vidéo pour débloquer les recommandations de performance.');
  const performers = Array.isArray(analytics.topPerformers) ? analytics.topPerformers : [];
  $('#top-performers').innerHTML = performers.length ? performers.map(item => `
    <article class="performer-card"><strong>${escapeHTML(item.videoDetails?.title || item.title || 'Vidéo sans titre')}</strong><div class="meta-line">Performance ${escapeHTML(item.performance?.score ?? item.performance_score ?? '—')} / 100</div></article>`).join('') : empty('Aucune vidéo analysée pour le moment.');
  renderOutcome(learning.outcome || {});
  renderLearning(learning);
  renderRetention(learning.retention || {});
}

function formatOutcomeValue(value, kind = 'number', currency = 'USD') {
  if (value === null || value === undefined) return 'Indisponible';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Indisponible';
  if (kind === 'currency') {
    try {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(number);
    } catch (_error) {
      return `${currency} ${number.toFixed(2)}`;
    }
  }
  if (kind === 'percent') return `${number.toFixed(1)}%`;
  if (kind === 'hours') return `${number.toFixed(1)}h`;
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(number);
}

function renderOutcome(outcome = {}) {
  const status = $('#outcome-status');
  if (!outcome.configured || !outcome.goal) {
    status.textContent = 'Non configuré';
    status.className = 'status';
    $('#outcome-summary').innerHTML = empty('Choisissez un objectif principal mesurable dans la stratégie de l’Opérateur autonome.');
    $('#outcome-economics').innerHTML = '';
    $('#outcome-breakdowns').innerHTML = '';
    $('#outcome-policy').textContent = outcome.evidencePolicy || 'Configurez un objectif principal pour activer l’apprentissage aligné sur les objectifs.';
    return;
  }
  const { goal, economics = {}, coverage = {}, breakdowns = {} } = outcome;
  status.textContent = outcome.available ? 'Mesure en cours' : 'En attente de preuves';
  status.className = `status ${outcome.available ? 'active' : ''}`;
  const target = goal.targetValue === null
    ? `Aucun objectif numérique · fenêtre de preuve de ${goal.windowDays} jours`
    : `objectif ${formatOutcomeValue(goal.targetValue, goal.unit, goal.currency)} · ${goal.windowDays} jours`;
  const progress = outcome.progressPercent === null ? null : Math.min(100, Number(outcome.progressPercent));
  $('#outcome-summary').innerHTML = `
    <div class="outcome-primary">
      <span>${escapeHTML(goal.label)}</span>
      <strong>${escapeHTML(outcome.formattedObserved || 'Indisponible')}</strong>
      <small>${escapeHTML(target)} · ${Number(outcome.measuredVideoCount || 0)} vidéos mesurées</small>
      ${progress === null ? '' : `<div class="outcome-progress" role="progressbar" aria-label="Progression vers l’objectif" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><small>${Number(outcome.progressPercent).toFixed(1)}% de l’objectif d’après les fenêtres de mesure enregistrées</small>`}
    </div>`;
  const economicsRows = [
    ['Abonnés nets', economics.netSubscribers, 'number', coverage.subscribers],
    ['Heures de visionnage', economics.watchHours, 'hours', null],
    ['Revenu estimé', economics.estimatedRevenue, 'currency', coverage.revenue],
    ['Coût de production connu', economics.knownProductionCost, 'currency', coverage.cost],
    ['ROI estimé', economics.roi, 'percent', null],
    ['Budget utilisé', economics.budgetUsedPercent, 'percent', null]
  ];
  $('#outcome-economics').innerHTML = economicsRows.map(([name, value, kind, metricCoverage]) => `
    <div><span>${escapeHTML(name)}</span><strong>${escapeHTML(formatOutcomeValue(value, kind, economics.currency || goal.currency))}</strong>${metricCoverage ? `<small>${Number(metricCoverage.measured || 0)}/${Number(metricCoverage.total || 0)} vidéos mesurées</small>` : ''}</div>`).join('');
  const dimensions = [
    ['pillar', 'Piliers de contenu'], ['format', 'Formats'], ['provider', 'Fournisseurs de production']
  ].filter(([key]) => Array.isArray(breakdowns[key]) && breakdowns[key].length);
  $('#outcome-breakdowns').innerHTML = dimensions.length ? dimensions.map(([key, heading]) => `
    <section><h3>${escapeHTML(heading)}</h3>${breakdowns[key].slice(0, 5).map(item => `
      <div class="outcome-breakdown-row"><span>${escapeHTML(label(item.name))}<small>${Number(item.count || 0)} vidéo${Number(item.count || 0) === 1 ? '' : 's'}</small></span><strong>${escapeHTML(formatOutcomeValue(item.average, goal.unit, goal.currency))} moy.</strong></div>`).join('')}</section>`).join('') : empty('Les répartitions apparaissent lorsque les vidéos mesurées partagent un pilier, un format ou un fournisseur comparable.');
  $('#outcome-policy').textContent = outcome.evidencePolicy;
}

function renderLearning(learning = {}) {
  const baseline = learning.baseline || {};
  $('#learning-snapshot-count').textContent = `${learning.snapshotCount || 0} instantanés`;
  $('#learning-approved-count').textContent = `${learning.approvedCount || 0} approuvées`;
  const metrics = [
    ['CTR', baseline.ctr, '%'],
    ['Rétention', baseline.retention, '%'],
    ['Engagement', baseline.engagementRate, '%'],
    ['Performance', baseline.performanceScore, '/100']
  ];
  $('#learning-baseline').innerHTML = learning.measuredVideos ? metrics.map(([name, value, suffix]) => `
    <div><span>${escapeHTML(name)}</span><strong>${Number(value || 0).toFixed(1)}${escapeHTML(suffix)}</strong></div>`).join('') : empty('Deux mesures réelles débloquent des recommandations fondées sur des preuves.');

  const recommendations = Array.isArray(learning.recommendations) ? learning.recommendations : [];
  $('#learning-recommendations').innerHTML = recommendations.length ? recommendations.map(item => `
    <article class="learning-card">
      <div class="learning-card-heading"><strong>${escapeHTML(item.title)}</strong>${statusChip(item.status)}</div>
      <p>${escapeHTML(item.rationale)}</p>
      <div class="learning-meta"><span>${escapeHTML(label(item.category))} · confiance ${escapeHTML(label(item.confidence))}</span>
        <span class="learning-actions">
          ${item.status !== 'approved' ? `<button class="text-button approve" data-learning-action="approve" data-learning-id="${escapeHTML(item.id)}">Approuver</button>` : ''}
          ${item.status !== 'rejected' ? `<button class="text-button" data-learning-action="reject" data-learning-id="${escapeHTML(item.id)}">Rejeter</button>` : ''}
        </span>
      </div>
    </article>`).join('') : empty('Aucune recommandation pour le moment. Lumen a besoin d’au moins deux mesures réelles suffisamment exposées.');
}

function renderGrowthExperiments(summary = {}) {
  const experiments = Array.isArray(summary.experiments) ? summary.experiments : [];
  const candidates = Array.isArray(summary.candidates) ? summary.candidates : [];
  const candidate = $('#experiment-candidate');
  const create = $('#experiment-create-button');
  candidate.innerHTML = candidates.length
    ? candidates.map(item => `<option value="${escapeHTML(item.productionId)}">${escapeHTML(item.title || item.productionId)}</option>`).join('')
    : '<option value="">Aucune variante publiée éligible</option>';
  candidate.disabled = !candidates.length;
  create.disabled = !candidates.length;
  $('#experiment-status').textContent = `${Number(summary.activeCount || 0)} en cours · ${Number(summary.awaitingDecisionCount || 0)} décision${Number(summary.awaitingDecisionCount || 0) === 1 ? '' : 's'}`;
  $('#experiment-policy').textContent = summary.evidencePolicy || 'Seules des preuves YouTube réelles font avancer les tests contrôlés.';

  $('#growth-experiments').innerHTML = experiments.length ? experiments.map(experiment => {
    const winner = experiment.arms?.find(arm => arm.id === experiment.winningArmId);
    const actions = [];
    if (experiment.status === 'draft') actions.push(`<button class="text-button approve" data-experiment-action="approve" data-experiment-id="${escapeHTML(experiment.id)}">Approuver le plan</button>`);
    if (experiment.status === 'approved') actions.push(`<button class="button primary small" data-experiment-action="start" data-experiment-id="${escapeHTML(experiment.id)}">Démarrer le test en direct</button>`);
    if (experiment.status === 'running') {
      actions.push(`<button class="button secondary small" data-experiment-action="refresh" data-experiment-id="${escapeHTML(experiment.id)}">Actualiser les preuves</button>`);
      actions.push(`<button class="text-button" data-experiment-action="cancel" data-experiment-id="${escapeHTML(experiment.id)}">Annuler et restaurer le témoin</button>`);
    }
    if (experiment.status === 'action_required') actions.push(`<button class="text-button" data-experiment-action="cancel" data-experiment-id="${escapeHTML(experiment.id)}">Réessayer la restauration du témoin</button>`);
    if (experiment.status === 'awaiting_winner') actions.push(`<button class="button primary small" data-experiment-action="adopt" data-experiment-id="${escapeHTML(experiment.id)}">Adopter ${escapeHTML(winner?.label || 'le gagnant')}</button>`);
    const arms = (experiment.arms || []).map(arm => {
      const result = arm.result || {};
      const active = arm.id === experiment.currentArmId && experiment.status === 'running';
      return `<div class="experiment-arm ${active ? 'active' : ''} ${arm.id === experiment.winningArmId ? 'winner' : ''}">
        <div><strong>${escapeHTML(arm.label)}</strong>${arm.isControl ? '<small>Témoin</small>' : ''}</div>
        <span>${escapeHTML(arm.title)}</span>
        <div class="experiment-arm-metrics"><b>${Number(result.ctr || 0).toFixed(2)}% CTR</b><small>${Number(result.impressions || 0).toLocaleString('fr-FR')} impressions</small></div>
      </div>`;
    }).join('');
    return `<article class="growth-experiment-card">
      <div class="learning-card-heading"><strong>${escapeHTML(experiment.title)}</strong>${statusChip(experiment.status)}</div>
      <p>${escapeHTML(experiment.hypothesis)}</p>
      <div class="experiment-arm-list">${arms}</div>
      ${experiment.result?.reason ? `<p class="experiment-result"><strong>Résultat :</strong> ${escapeHTML(experiment.result.reason)}${experiment.result.liftPercent !== undefined ? ` · ${escapeHTML(experiment.result.liftPercent)}% de hausse` : ''}</p>` : ''}
      <div class="learning-meta"><span>${Number(experiment.armDurationHours || 0)}h par variante · ${Number(experiment.minImpressions || 0).toLocaleString('fr-FR')} impressions minimum</span><span class="learning-actions">${actions.join('')}</span></div>
    </article>`;
  }).join('') : empty('Publiez du contenu avec des variantes de titre et de miniature d’apprentissage approuvées pour créer le premier test contrôlé.');
}

function renderRetention(retention = {}) {
  const snapshots = Array.isArray(retention.snapshots) ? retention.snapshots : [];
  const select = $('#retention-snapshot-select');
  const refresh = $('#refresh-retention-button');
  if (!snapshots.length) {
    ui.retentionSnapshotId = null;
    select.innerHTML = '<option value="">Aucune courbe mesurée pour le moment</option>';
    select.disabled = true;
    refresh.disabled = true;
    $('#retention-meta').innerHTML = '';
    $('#retention-chart').innerHTML = empty('Les courbes de rétention apparaissent lorsqu’une vidéo publiée atteint une véritable fenêtre de mesure analytique.');
    $('#retention-scenes').innerHTML = '';
    return;
  }

  if (!snapshots.some(item => item.id === ui.retentionSnapshotId)) ui.retentionSnapshotId = snapshots[0].id;
  select.disabled = false;
  refresh.disabled = false;
  select.innerHTML = snapshots.map(item => `<option value="${escapeHTML(item.id)}" ${item.id === ui.retentionSnapshotId ? 'selected' : ''}>${escapeHTML(item.title || item.videoId)} · ${escapeHTML(label(item.surface))} · ${escapeHTML(item.measurementWindow)}</option>`).join('');
  const snapshot = snapshots.find(item => item.id === ui.retentionSnapshotId) || snapshots[0];
  refresh.dataset.videoId = snapshot.videoId;
  refresh.dataset.measurementWindow = snapshot.measurementWindow;

  const summary = snapshot.summary || {};
  $('#retention-meta').innerHTML = [
    `${snapshot.points?.length || 0} points réels`,
    `${snapshot.sceneMetrics?.length || 0} scènes`,
    `${summary.dropoffCount || 0} décrochages`,
    `${summary.rewatchCount || 0} signaux de revisionnage`,
    `confiance ${escapeHTML(label(snapshot.confidence))}`,
    `fenêtre ${escapeHTML(snapshot.measurementWindow)}`
  ].map(item => `<span>${item}</span>`).join('');
  $('#retention-chart').innerHTML = retentionChart(snapshot);
  $('#retention-scenes').innerHTML = (snapshot.sceneMetrics || []).map(scene => `
    <article class="retention-scene ${escapeHTML(scene.signal)}">
      <div class="retention-scene-heading"><div><span>Scène ${Number(scene.position || 0) + 1}</span><strong>${escapeHTML(scene.label)}</strong></div>${statusChip(scene.signal)}</div>
      <div class="retention-metrics">
        <div><span>Visionnage moyen</span><strong>${(Number(scene.averageWatchRatio || 0) * 100).toFixed(1)}%</strong></div>
        <div><span>Changement de scène</span><strong>${Number(scene.changePoints || 0) > 0 ? '+' : ''}${Number(scene.changePoints || 0).toFixed(1)} pts</strong></div>
        <div><span>Rétention relative</span><strong>${(Number(scene.averageRelativeRetention || 0) * 100).toFixed(1)}%</strong></div>
        <div><span>Chute la plus marquée</span><strong>${Number(scene.largestDropPoints || 0).toFixed(1)} pts</strong></div>
      </div>
    </article>`).join('') || empty('La courbe enregistrée n’a pas pu être associée à une chronologie de scènes.');
}

function renderEngagement(engagement = {}) {
  $('#engagement-policy').textContent = engagement.evidencePolicy || '';
  const posting = $('#engagement-posting-status');
  posting.textContent = engagement.postingEnabled ? 'publication activée' : 'publication verrouillée';
  posting.className = `status ${engagement.postingEnabled ? 'success' : 'warning'}`;
  posting.title = engagement.postingEnabled ? '' : 'Réautorisez YouTube (npm run walkthrough) pour accorder la permission de commentaire.';
  $('#engagement-drafts-count').textContent = `${engagement.pendingDrafts || 0} brouillons`;
  $('#engagement-attention-count').textContent = `${engagement.needsAttentionCount || 0} signalés`;
  $('#engagement-ideas-count').textContent = `${engagement.pendingAudienceIdeas || 0} en attente`;

  const insights = Array.isArray(engagement.insights) ? engagement.insights : [];
  const select = $('#engagement-video-select');
  if (!insights.length) {
    ui.engagementVideoId = null;
    ui.engagementDetail = null;
    select.innerHTML = '<option value="">Aucune vidéo synchronisée pour le moment</option>';
    select.disabled = true;
    $('#engagement-sync-button').disabled = true;
    $('#engagement-draft-button').disabled = true;
    $('#engagement-meta').innerHTML = '';
    $('#engagement-themes').innerHTML = empty('Les commentaires apparaissent après la synchronisation d’une vidéo publiée.');
    $('#engagement-drafts').innerHTML = empty('Rédigez des réponses depuis une vidéo synchronisée pour les examiner ici.');
    $('#engagement-attention').innerHTML = empty('Rien n’est signalé comme spam, arnaque ou toxique.');
  } else {
    if (!insights.some(item => item.videoId === ui.engagementVideoId)) ui.engagementVideoId = insights[0].videoId;
    select.disabled = false;
    select.innerHTML = insights.map(item => `<option value="${escapeHTML(item.videoId)}" ${item.videoId === ui.engagementVideoId ? 'selected' : ''}>${escapeHTML(item.title || item.videoId)}</option>`).join('');
    $('#engagement-sync-button').disabled = false;
    $('#engagement-sync-button').dataset.videoId = ui.engagementVideoId;
    $('#engagement-draft-button').disabled = false;
    $('#engagement-draft-button').dataset.videoId = ui.engagementVideoId;
    renderEngagementDetail();
  }
  renderAudienceIdeas();
}

function renderEngagementDetail() {
  const detail = ui.engagementDetail;
  if (!detail || detail.insight?.videoId !== ui.engagementVideoId) {
    loadEngagementDetail(ui.engagementVideoId);
    return;
  }
  const insight = detail.insight || {};
  const sentiment = insight.sentiment || {};
  const fallback = insight.analysisMethod === 'fallback';
  $('#engagement-meta').innerHTML = [
    `${insight.commentCount || 0} commentaires`,
    `${insight.analyzedCount || 0} analysés`,
    fallback ? 'Analyse IA indisponible — faits mécaniques uniquement' : `${sentiment.positive || 0} positifs · ${sentiment.neutral || 0} neutres · ${sentiment.negative || 0} négatifs`,
    insight.lastSyncedAt ? `synchronisé ${new Date(insight.lastSyncedAt).toLocaleString('fr-FR')}` : 'jamais synchronisé'
  ].map(item => `<span>${escapeHTML(item)}</span>`).join('');

  const themes = Array.isArray(insight.themes) ? insight.themes : [];
  $('#engagement-themes').innerHTML = themes.length ? themes.map(theme => `
    <article class="learning-card">
      <div class="learning-card-heading"><strong>${escapeHTML(theme.title)}</strong>${statusChip(theme.kind)}</div>
      <p>${escapeHTML(theme.summary)}</p>
      <div class="learning-meta"><span>${escapeHTML(String(theme.count || 0))} commentaires</span></div>
    </article>`).join('') : empty(fallback ? 'Les thèmes nécessitent un fournisseur de texte IA fonctionnel.' : 'Aucun thème récurrent pour le moment.');

  const commentsById = new Map((detail.comments || []).map(comment => [comment.commentId, comment]));
  const postingEnabled = ui.state?.engagement?.postingEnabled === true;
  const drafts = (detail.drafts || []).filter(draft => draft.status !== 'discarded');
  const draftsContainer = $('#engagement-drafts');
  // The 8s poll must not wipe a reply the operator is actively editing.
  const draftsHTML = drafts.length ? drafts.map(draft => {
    const comment = commentsById.get(draft.commentId) || {};
    const locked = draft.status === 'posted';
    return `
    <article class="comment-card" data-reply-card="${escapeHTML(draft.id)}">
      <div class="learning-card-heading"><strong>${escapeHTML(comment.authorName || 'Spectateur')}</strong>${statusChip(draft.status)}</div>
      <p class="comment-original">${escapeHTML(comment.text || '')}</p>
      <label><span>Réponse</span><textarea data-reply-text maxlength="1000" ${locked ? 'disabled' : ''}>${escapeHTML(draft.editedText || draft.draftText)}</textarea></label>
      ${draft.failureReason ? `<p class="meta-line">Dernière tentative échouée : ${escapeHTML(draft.failureReason)}</p>` : ''}
      <div class="learning-actions">
        ${locked ? '' : `<button class="button primary small" data-reply-approve="${escapeHTML(draft.id)}" ${postingEnabled ? '' : 'disabled title="Réautorisez YouTube pour activer la publication"'}>Approuver et publier</button>
        <button class="text-button" data-reply-save="${escapeHTML(draft.id)}">Enregistrer la modification</button>
        <button class="text-button danger-text" data-reply-discard="${escapeHTML(draft.id)}">Ignorer</button>`}
      </div>
    </article>`;
  }).join('') : empty('Aucun brouillon de réponse pour cette vidéo pour le moment.');
  // Guard the focused textarea only: a clicked action button also holds focus, and skipping
  // the rebuild for it would leave the panel showing pre-action state.
  const editingReply = draftsContainer.contains(document.activeElement)
    && document.activeElement.matches('[data-reply-text]');
  if (!editingReply) draftsContainer.innerHTML = draftsHTML;

  const attention = Array.isArray(insight.attentionFlags) ? insight.attentionFlags : [];
  $('#engagement-attention').innerHTML = attention.length ? attention.map(flag => {
    const comment = commentsById.get(flag.commentId) || {};
    return `
    <article class="comment-card">
      <div class="learning-card-heading"><strong>${escapeHTML((flag.categories || []).join(', '))}</strong></div>
      <p class="comment-original">${escapeHTML(comment.text || '')}</p>
      <a class="text-button" href="${escapeHTML(flag.permalink || '#')}" target="_blank" rel="noopener noreferrer">Ouvrir sur YouTube</a>
    </article>`;
  }).join('') : empty('Rien n’est signalé comme spam, arnaque ou toxique.');
}

async function loadEngagementDetail(videoId) {
  if (!videoId) return;
  try {
    const data = await api(`/api/engagement/${encodeURIComponent(videoId)}`);
    ui.engagementDetail = data.result;
    renderEngagementDetail();
  } catch (_error) { /* toast already shown by api() */ }
}

function renderAudienceIdeas() {
  const recommendations = (ui.state?.learning?.recommendations || []).filter(item => item.category === 'audience_demand');
  $('#engagement-ideas').innerHTML = recommendations.length ? recommendations.map(item => `
    <article class="learning-card">
      <div class="learning-card-heading"><strong>${escapeHTML(item.title)}</strong>${statusChip(item.status)}</div>
      <p>${escapeHTML(item.rationale)}</p>
      <div class="learning-meta"><span>confiance ${escapeHTML(label(item.confidence))}</span>
        <span class="learning-actions">
          ${item.status !== 'approved' ? `<button class="text-button approve" data-learning-action="approve" data-learning-id="${escapeHTML(item.id)}">Approuver</button>` : ''}
          ${item.status !== 'rejected' ? `<button class="text-button" data-learning-action="reject" data-learning-id="${escapeHTML(item.id)}">Rejeter</button>` : ''}
        </span>
      </div>
    </article>`).join('') : empty('Les demandes d’audience extraites apparaissent ici une fois que l’analyse des commentaires détecte des demandes répétées.');
}

function retentionChart(snapshot = {}) {
  const points = Array.isArray(snapshot.points) ? snapshot.points : [];
  if (points.length < 2) return empty('Cet instantané ne contient pas assez de points pour tracer une courbe.');
  const width = 1000;
  const height = 280;
  const left = 46;
  const right = 18;
  const top = 18;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxRatio = Math.max(1, Math.min(1.5, Math.max(...points.map(point => Number(point.audienceWatchRatio || 0))) * 1.05));
  const x = ratio => left + Math.max(0, Math.min(1, Number(ratio || 0))) * plotWidth;
  const y = ratio => top + (1 - Math.max(0, Math.min(maxRatio, Number(ratio || 0))) / maxRatio) * plotHeight;
  const line = points.map(point => `${x(point.elapsedRatio).toFixed(1)},${y(point.audienceWatchRatio).toFixed(1)}`).join(' ');
  const duration = Math.max(1, Number(snapshot.durationSeconds || 1));
  const sceneBands = (snapshot.sceneMetrics || []).map((scene, index) => {
    const start = x(Number(scene.startSeconds || 0) / duration);
    const end = x(Number(scene.endSeconds || 0) / duration);
    return `<g><rect x="${start.toFixed(1)}" y="${top}" width="${Math.max(1, end - start).toFixed(1)}" height="${plotHeight}" class="retention-band band-${index % 2}"/><line x1="${start.toFixed(1)}" y1="${top}" x2="${start.toFixed(1)}" y2="${top + plotHeight}" class="scene-boundary"/><title>${escapeHTML(scene.label)}</title></g>`;
  }).join('');
  const grid = [0.25, 0.5, 0.75, 1].map(value => {
    const lineY = y(value);
    return `<line x1="${left}" y1="${lineY.toFixed(1)}" x2="${width - right}" y2="${lineY.toFixed(1)}" class="retention-grid-line"/><text x="${left - 8}" y="${(lineY + 4).toFixed(1)}" text-anchor="end">${Math.round(value * 100)}%</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="retention-chart-title retention-chart-desc">
    <title id="retention-chart-title">Rétention de l’audience pour ${escapeHTML(snapshot.title || snapshot.videoId)}</title>
    <desc id="retention-chart-desc">Une courbe de rétention d’audience à ${points.length} points, divisée en ${snapshot.sceneMetrics?.length || 0} scènes de production.</desc>
    ${sceneBands}${grid}
    <polyline points="${line}" class="retention-line"/>
    <text x="${left}" y="${height - 10}" text-anchor="start">Début</text>
    <text x="${width - right}" y="${height - 10}" text-anchor="end">Fin</text>
  </svg>`;
}

function renderActivation(activation = {}) {
  const container = $('#activation-list');
  if (!container) return;
  const milestones = activation.milestones || {};
  const rows = [
    ['Configuration prête', milestones.setupReady],
    ['Premier MP4 réel', milestones.firstRealVideo],
    ['Première approbation', milestones.firstApproval],
    ['Première publication YouTube', milestones.firstPublish],
    ['Deuxième MP4 réel', milestones.secondRealVideo]
  ];
  container.innerHTML = rows.map(([name, milestone = {}]) => `
    <div class="timeline-item">
      <div class="timeline-dot ${milestone.achieved ? 'done' : ''}"></div>
      <div><strong>${escapeHTML(name)}</strong><div class="meta-line">${milestone.achieved ? escapeHTML(formatDate(milestone.at)) : 'Pas encore atteint'}</div></div>
    </div>`).join('');
  if (milestones.firstRealVideo?.achieved) {
    container.insertAdjacentHTML('beforeend', `
      <div class="activation-share">
        <span>Vous avez créé quelque chose de concret avec Lumen ?</span>
        <a class="button secondary small" href="https://github.com/darkzOGx/youtube-automation-agent/discussions/new?category=show-and-tell" target="_blank" rel="noreferrer">Partagez ce que vous avez créé</a>
      </div>`);
  }
}

function renderOperator(strategy, runs, system) {
  const form = $('#strategy-form');
  const mapping = strategy ? {
    objective: strategy.objective,
    audience: strategy.audience,
    valueProposition: strategy.value_proposition,
    contentPillars: (strategy.contentPillars || []).join(', '),
    cadencePerWeek: strategy.cadence_per_week,
    videosPerRun: strategy.videos_per_run,
    defaultFormat: strategy.default_format,
    defaultLength: strategy.default_length,
    successMetric: strategy.success_metric,
    primaryKpi: strategy.primary_kpi,
    targetValue: strategy.target_value,
    targetWindowDays: strategy.target_window_days,
    monthlyBudget: strategy.monthly_budget,
    outcomeCurrency: strategy.outcome_currency,
    constraints: strategy.constraints
  } : {};
  for (const [name, value] of Object.entries(mapping)) {
    if (form.elements[name] && document.activeElement !== form.elements[name]) form.elements[name].value = value ?? '';
  }

  const strategyStatus = strategy?.status || 'not_configured';
  $('#operator-strategy-status').className = `status ${escapeHTML(strategyStatus)}`;
  $('#operator-strategy-status').textContent = label(strategyStatus);
  const run = runs[0];
  const active = run && ['queued', 'running', 'cancelling'].includes(run.status);
  const recoverable = run && ['failed', 'interrupted', 'completed_with_issues'].includes(run.status);
  $('#activate-operator-button').disabled = Boolean(system.setupRequired || active || system.readiness?.status === 'failed');
  $('#activate-operator-button').title = system.readiness?.status === 'failed' ? 'Résolvez d’abord les échecs de préparation de production' : '';
  $('#activate-operator-button').textContent = strategy?.status === 'active' ? 'Lancer la stratégie maintenant' : 'Activer et lancer maintenant';
  $('#pause-operator-button').classList.toggle('hidden', strategy?.status !== 'active');
  $('#cancel-operator-run').classList.toggle('hidden', !active);
  if (active) $('#cancel-operator-run').dataset.runId = run.id;
  $('#resume-operator-run').classList.toggle('hidden', !recoverable);
  $('#resume-operator-run').disabled = Boolean(system.setupRequired || system.readiness?.status === 'failed');
  if (recoverable) $('#resume-operator-run').dataset.runId = run.id;

  if (!run) {
    $('#operator-run-title').textContent = 'En attente d’une stratégie';
    $('#operator-run-summary').innerHTML = empty('Enregistrez un mandat de chaîne, puis activez-le pour rechercher et produire le premier plan.');
    $('#operator-plan').innerHTML = empty('Aucun plan éditorial pour le moment.');
    return;
  }

  $('#operator-run-title').textContent = `${label(run.stage)} · ${run.progress || 0}%`;
  const sources = Array.isArray(run.research?.sources) ? run.research.sources.join(', ') : 'Recherche en attente';
  $('#operator-run-summary').innerHTML = `<div class="run-summary">
    <div class="progress"><i style="width:${Math.max(0, Math.min(100, run.progress || 0))}%"></i></div>
    <div class="run-summary-row"><span>Statut</span><strong>${statusChip(run.status)}</strong></div>
    <div class="run-summary-row"><span>Recherche</span><strong>${escapeHTML(sources)}</strong></div>
    <div class="run-summary-row"><span>Produit</span><strong>${escapeHTML(run.summary?.generated || 0)} / ${escapeHTML(run.summary?.planned || run.plan?.length || 0)}</strong></div>
    <div class="run-summary-row"><span>Nécessite une revue</span><strong>${escapeHTML(run.summary?.needsReview || 0)}</strong></div>
    ${run.error ? `<p class="callout">${escapeHTML(run.error)}</p>` : ''}
  </div>`;
  const plan = Array.isArray(run.plan) ? run.plan : [];
  $('#operator-plan').innerHTML = plan.length ? plan.map((item, index) => {
    const job = (run.generatedJobs || []).find(candidate => candidate.topic === item.topic);
    return `<article class="plan-card">
      <div class="meta-line">${index + 1} · ${escapeHTML(item.format)} · ${escapeHTML(item.length)} ${job ? `· ${statusChip(job.reviewStatus || job.status)}` : ''}</div>
      <strong>${escapeHTML(item.topic)}</strong>
      <p>${escapeHTML(item.angle || item.rationale)}</p>
    </article>`;
  }).join('') : empty('La recherche et la planification apparaîtront ici au démarrage de l’exécution.');
}

function populateSettings(profile = {}, settings = {}, providers = []) {
  const form = $('#profile-form');
  const mapping = {
    channelName: profile.channel_name,
    goal: profile.goal,
    targetAudience: profile.target_audience,
    brandVoice: profile.brand_voice,
    defaultStyle: profile.default_style,
    callToAction: profile.call_to_action,
    visualStyle: profile.visual_style,
    timezone: profile.timezone,
    language: profile.content_language || 'fr',
    bannedTopics: (profile.bannedTopics || []).join(', ')
  };
  for (const [name, value] of Object.entries(mapping)) {
    if (form.elements[name] && document.activeElement !== form.elements[name]) form.elements[name].value = value || '';
  }
  $('#approval-required').checked = settings.approval_required !== 'false';
  $('#notifications-enabled').checked = settings.notification_enabled !== 'false';
  const videoMapping = {
    videoProvider: settings.video_provider || 'slideshow',
    videoGenerationMode: settings.video_generation_mode || 'hybrid',
    videoClipDuration: settings.video_clip_duration || '8',
    videoMaxGeneratedSeconds: settings.video_max_generated_seconds || '60'
  };
  for (const [name, value] of Object.entries(videoMapping)) {
    if (form.elements[name] && document.activeElement !== form.elements[name]) form.elements[name].value = value;
  }
  const selected = providers.find(provider => provider.id === videoMapping.videoProvider);
  $('#video-provider-status').textContent = videoMapping.videoProvider === 'auto'
    ? `${providers.filter(provider => provider.available && provider.id !== 'slideshow').length} fournisseur(s) payant(s) disponible(s) ; le diaporama local reste la solution de secours finale.`
    : videoMapping.videoProvider === 'slideshow' ? 'Le diaporama FFmpeg local est sélectionné ; aucun identifiant vidéo externe n’est requis.'
      : selected?.available ? `${label(selected.id)} est configuré (${selected.model}).` : `Les identifiants ${label(videoMapping.videoProvider)} ne sont pas configurés.`;
}

function switchView(view) {
  ui.currentView = view;
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  $$('.view').forEach(item => item.classList.toggle('active', item.id === `${view}-view`));
  const titles = {
    overview: ['VUE D’ENSEMBLE OPÉRATEUR', 'Sachez ce qui va se passer.'],
    channels: ['CHAÎNES GÉRÉES', 'Une automatisation indépendante par chaîne.'],
    operator: ['OPÉRATEUR AUTONOME', 'Donnez la stratégie à Lumen.'],
    pipeline: ['OPÉRATIONS DE CONTENU', 'De l’idée à la publication.'],
    calendar: ['PLANIFICATION ÉDITORIALE', 'Planifiez avant de générer.'],
    analytics: ['PERFORMANCE', 'Transformez les résultats en prochaine étape.'],
    engagement: ['ENGAGEMENT DE L’AUDIENCE', 'Échangez avec les personnes qui regardent.'],
    readiness: ['PRÉPARATION À LA PRODUCTION', 'Vérifiez avant que l’autonomie ne s’exécute.'],
    settings: ['GARDE-FOUS DE LA CHAÎNE', 'Faites en sorte que chaque agent vous ressemble.']
  };
  $('#view-eyebrow').textContent = titles[view][0];
  $('#view-title').textContent = titles[view][1];
  location.hash = view;
}

function selectOptions(options, selected) {
  return options.map(([value, label]) =>
    `<option value="${escapeHTML(value)}" ${value === selected ? 'selected' : ''}>${escapeHTML(label)}</option>`
  ).join('');
}

function renderSourceEditor(source = {}, disabled = false) {
  return `<article class="provenance-item" data-provenance-source data-id="${escapeHTML(source.id || '')}" data-published-at="${escapeHTML(source.publishedAt || '')}" data-accessed-at="${escapeHTML(source.accessedAt || '')}">
    <div class="provenance-item-heading"><strong>Source de recherche</strong><button type="button" class="text-button danger-text" data-remove-provenance ${disabled ? 'disabled' : ''}>Supprimer</button></div>
    <label><span>URL</span><input data-field="url" type="url" value="${escapeHTML(source.url || '')}" placeholder="https://..." required ${disabled ? 'disabled' : ''}></label>
    <div class="form-grid two">
      <label><span>Titre</span><input data-field="title" value="${escapeHTML(source.title || '')}" maxlength="300" ${disabled ? 'disabled' : ''}></label>
      <label><span>Éditeur</span><input data-field="publisher" value="${escapeHTML(source.publisher || '')}" maxlength="200" ${disabled ? 'disabled' : ''}></label>
      <label><span>Type</span><select data-field="sourceType" ${disabled ? 'disabled' : ''}>${selectOptions([
        ['official', 'Source officielle'], ['article', 'Article'], ['video', 'Vidéo'], ['dataset', 'Jeu de données'], ['asset', 'Ressource ou licence'], ['other', 'Autre']
      ], source.sourceType || 'other')}</select></label>
      <label><span>Statut de revue</span><select data-field="status" ${disabled ? 'disabled' : ''}>${selectOptions([
        ['pending', 'En attente de revue'], ['verified', 'Vérifié'], ['rejected', 'Rejeté']
      ], source.status || 'pending')}</select></label>
    </div>
    <label><span>Notes de preuve</span><textarea data-field="notes" rows="2" maxlength="1000" ${disabled ? 'disabled' : ''}>${escapeHTML(source.notes || '')}</textarea></label>
    ${source.url ? `<a class="source-link" href="${escapeHTML(source.url)}" target="_blank" rel="noopener">Ouvrir la source ↗</a>` : ''}
  </article>`;
}

function renderClaimEditor(claim = {}, sources = [], disabled = false) {
  const linked = new Set(claim.sourceIds || []);
  return `<article class="provenance-item ${claim.riskLevel === 'high' ? 'high-risk' : ''}" data-provenance-claim data-id="${escapeHTML(claim.id || '')}">
    <div class="provenance-item-heading"><strong>Affirmation factuelle</strong><button type="button" class="text-button danger-text" data-remove-provenance ${disabled ? 'disabled' : ''}>Supprimer</button></div>
    <label><span>Affirmation</span><textarea data-field="text" rows="3" maxlength="1000" required ${disabled ? 'disabled' : ''}>${escapeHTML(claim.text || '')}</textarea></label>
    <div class="form-grid two">
      <label><span>Risque</span><select data-field="riskLevel" ${disabled ? 'disabled' : ''}>${selectOptions([
        ['standard', 'Standard'], ['high', 'Risque élevé']
      ], claim.riskLevel || 'standard')}</select></label>
      <label><span>Résolution</span><select data-field="status" ${disabled ? 'disabled' : ''}>${selectOptions([
        ['pending', 'En attente'], ['supported', 'Étayée'], ['unsupported', 'Non étayée'], ['waived', 'Dispensée avec note']
      ], claim.status || 'pending')}</select></label>
    </div>
    <fieldset class="source-checklist" ${disabled ? 'disabled' : ''}><legend>Sources justificatives</legend>
      ${sources.length ? sources.map(source => `<label><input type="checkbox" data-claim-source="${escapeHTML(source.id)}" ${linked.has(source.id) ? 'checked' : ''}> ${escapeHTML(source.title || source.url)}</label>`).join('') : '<small>Ajoutez une source avant de marquer cette affirmation comme étayée.</small>'}
    </fieldset>
    <label><span>Notes du relecteur</span><textarea data-field="notes" rows="2" maxlength="1000" placeholder="Requis en cas de dispense" ${disabled ? 'disabled' : ''}>${escapeHTML(claim.notes || '')}</textarea></label>
  </article>`;
}

function renderProvenanceEditor(provenance = {}, canReview = true) {
  const sources = provenance.sources || [];
  const claims = provenance.claims || [];
  const summary = provenance.summary || {};
  const statusLabel = provenance.status === 'verified' ? 'Preuves vérifiées' : provenance.status === 'not_required' ? 'Aucune affirmation déclarée' : `${summary.unresolvedClaims || 0} non résolue(s)`;
  return `<section class="provenance-panel">
    <div class="panel-heading"><div><p class="eyebrow">RECHERCHE ET PROVENANCE</p><h3>Bureau des preuves</h3><p>Vérifiez les sources, associez chaque affirmation factuelle et enregistrez la divulgation avant approbation.</p></div><span class="status ${provenance.status === 'verified' || provenance.status === 'not_required' ? 'success' : 'warning'}">${escapeHTML(statusLabel)}</span></div>
    <div class="provenance-toolbar"><strong>Sources</strong>${canReview ? '<button type="button" class="text-button" data-add-provenance-source>Ajouter une source +</button>' : ''}</div>
    <div id="provenance-sources" class="provenance-list">${sources.map(source => renderSourceEditor(source, !canReview)).join('') || '<p class="empty-inline">Aucune source de recherche associée.</p>'}</div>
    <div class="provenance-toolbar"><strong>Affirmations</strong>${canReview ? '<button type="button" class="text-button" data-add-provenance-claim>Ajouter une affirmation +</button>' : ''}</div>
    <div id="provenance-claims" class="provenance-list">${claims.map(claim => renderClaimEditor(claim, sources, !canReview)).join('') || '<p class="empty-inline">Aucune affirmation vérifiable en externe déclarée.</p>'}</div>
    <label class="toggle disclosure-toggle"><input id="contains-synthetic-media" type="checkbox" ${provenance.containsSyntheticMedia ? 'checked' : ''} ${canReview ? '' : 'disabled'}><span></span> Contient des médias modifiés ou synthétiques réalistes nécessitant une divulgation YouTube</label>
    ${canReview ? '<button type="button" class="button secondary" data-save-provenance>Enregistrer la revue des preuves</button>' : ''}
  </section>`;
}

function renderDiscoverabilityPanel(item) {
  const audit = item.discoverability;
  const findings = audit?.findings || [];
  const state = !audit ? 'Non exécuté' : audit.status === 'unavailable' ? 'Indisponible' : `${findings.length} résultat${findings.length === 1 ? '' : 's'}`;
  const stateClass = audit?.status === 'passed' || (audit && findings.length === 0) ? 'success' : 'warning';
  return `<section class="discoverability-panel">
    <div class="panel-heading discoverability-heading">
      <div><p class="eyebrow">VÉRIFICATION DE DÉCOUVRABILITÉ</p><h3>Revue DarkzSEO</h3><p>Vérifiez les recommandations GEO, AIO, AEO et de recherche web pour ce contenu. Les résultats sont consultatifs et ne réécrivent ni ne publient jamais de contenu.</p></div>
      <div class="discoverability-actions"><span class="status ${stateClass}">${escapeHTML(state)}</span><button type="button" class="button secondary small" data-discoverability-run="${escapeHTML(item.id)}">${audit ? 'Relancer' : 'Lancer l’audit'}</button></div>
    </div>
    ${audit?.error ? `<p class="callout">DarkzSEO n’a pas pu s’exécuter${audit.errorCode || audit.error_code ? ` (${escapeHTML(audit.errorCode || audit.error_code)})` : ''} : ${escapeHTML(audit.error)}</p>` : ''}
    ${findings.length ? `<div class="discoverability-findings">${findings.map(finding => {
      const reviewStatus = finding.reviewStatus || finding.review_status || 'pending';
      return `<article class="discoverability-finding severity-${escapeHTML(String(finding.severity || 'info').toLowerCase())}" data-discoverability-finding="${escapeHTML(finding.id)}">
        <div class="discoverability-finding-heading"><span class="severity-badge">${escapeHTML(finding.severity)}</span><strong>${escapeHTML(finding.ruleId || finding.rule_id)}</strong><span class="review-state ${escapeHTML(reviewStatus)}">${escapeHTML(label(reviewStatus))}</span></div>
        <p>${escapeHTML(finding.message)}</p>
        ${finding.remediation ? `<small>${escapeHTML(finding.remediation)}</small>` : ''}
        ${finding.reviewReason || finding.review_reason ? `<small>Note du relecteur : ${escapeHTML(finding.reviewReason || finding.review_reason)}</small>` : ''}
        <div class="discoverability-review-actions"><button type="button" class="text-button approve" data-discoverability-accept ${reviewStatus === 'accepted' ? 'disabled' : ''}>Conserver comme actionnable</button><button type="button" class="text-button" data-discoverability-dismiss ${reviewStatus === 'dismissed' ? 'disabled' : ''}>Ignorer (faux positif)</button></div>
      </article>`;
    }).join('')}</div>` : audit && audit.status !== 'unavailable' ? '<p class="empty-inline">Aucun résultat de découvrabilité. Le contenu a passé les vérifications consultatives configurées.</p>' : '<p class="empty-inline">Lancez DarkzSEO pour créer un audit versionné et vérifiable pour cette production.</p>'}
  </section>`;
}

function renderSceneEditor(item, canReview = true) {
  const scenes = item.scenes || [];
  if (!scenes.length) return '';
  const verifiedSources = (item.provenance?.sources || []).filter(source => source.status === 'verified');
  const audio = item.assets?.audio || {};
  const intentionalSilence = audio.intentionalSilence === true;
  const narrationIssues = scenes.filter(scene => !['current', 'intentional_silence'].includes(scene.narrationStatus)).length;
  return `<section class="scene-repair-panel">
    <div class="panel-heading scene-heading">
      <div><p class="eyebrow">ATELIER DE RÉPARATION DE SCÈNES</p><h3>Réparez la chronologie, pas toute la vidéo</h3><p>Modifiez, remplacez ou régénérez une scène. Les modifications restent à l’état de brouillon jusqu’à la reconstruction et l’approbation de la chronologie.</p></div>
      ${canReview ? `<button type="button" class="button primary small" data-rebuild-scenes="${escapeHTML(item.id)}">Reconstruire la vidéo finale</button>` : ''}
    </div>
    <div class="narration-recovery ${intentionalSilence ? 'intentional' : narrationIssues ? 'attention' : ''}">
      <div><p class="eyebrow">FIABILITÉ DE LA NARRATION</p><strong>${intentionalSilence ? 'Silence intentionnel confirmé' : narrationIssues ? `${narrationIssues} scène${narrationIssues === 1 ? '' : 's'} nécessite${narrationIssues === 1 ? '' : 'nt'} une narration` : 'Les preuves de narration sont à jour'}</strong>
      <p>${intentionalSilence ? escapeHTML(audio.silenceReason || '') : audio.error ? escapeHTML(audio.error) : 'Régénérez la narration sans remplacer le visuel de la scène. L’approbation reste bloquée tant que l’audio n’est pas prêt.'}</p>
      ${audio.provider ? `<span class="narration-evidence">${escapeHTML(audio.provider)}${audio.model ? ` · ${escapeHTML(audio.model)}` : ''}${audio.externalTaskId ? ` · tâche ${escapeHTML(audio.externalTaskId)}` : ''}</span>` : ''}</div>
      ${canReview ? intentionalSilence
        ? '<button type="button" class="button secondary small" data-require-narration>Exiger une narration</button>'
        : '<button type="button" class="button secondary small" data-intentional-silence>Utiliser un silence intentionnel</button>' : ''}
    </div>
    <div class="scene-summary"><strong>${scenes.length} scènes</strong><span>chronologie de ${Math.round(scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0))}s</span><span>${scenes.filter(scene => scene.status !== 'ready').length} réparations en attente</span></div>
    <div class="scene-list">
      ${scenes.map((scene, index) => {
        const disabled = !canReview || scene.locked;
        const sourceIds = new Set(scene.provenanceSourceIds || []);
        const preview = scene.assetUrl
          ? scene.assetType === 'video'
            ? `<video controls preload="metadata"><source src="${escapeHTML(scene.assetUrl)}"></video>`
            : `<img src="${escapeHTML(scene.assetUrl)}" alt="${escapeHTML(scene.label)} scene asset">`
          : '<div class="preview-placeholder">Aucune ressource de scène</div>';
        return `<article class="scene-card ${scene.locked ? 'locked' : ''}" data-scene-card="${escapeHTML(scene.id)}">
          <div class="scene-card-top">
            <div class="scene-preview">${preview}<span class="scene-number">${index + 1}</span></div>
            <div class="scene-identity">
              <div class="scene-status-row">${statusChip(scene.status)} ${statusChip(`narration_${scene.narrationStatus || 'unavailable'}`)}<span>r${scene.revision}</span></div>
              <label><span>Nom de la scène</span><input data-scene-field="label" maxlength="120" value="${escapeHTML(scene.label)}" ${disabled ? 'disabled' : ''}></label>
              <label><span>Durée</span><input data-scene-field="duration" type="number" min="2" max="600" step="0.5" value="${escapeHTML(scene.duration)}" ${disabled ? 'disabled' : ''}></label>
            </div>
          </div>
          <label><span>Narration</span><textarea data-scene-field="scriptText" rows="4" maxlength="10000" ${disabled ? 'disabled' : ''}>${escapeHTML(scene.scriptText)}</textarea></label>
          <label><span>Prompt visuel</span><textarea data-scene-field="prompt" rows="3" maxlength="2000" ${disabled ? 'disabled' : ''}>${escapeHTML(scene.prompt)}</textarea></label>
          ${verifiedSources.length ? `<fieldset class="source-checklist scene-sources" ${disabled ? 'disabled' : ''}><legend>Preuves vérifiées liées à cette narration</legend>${verifiedSources.map(source => `<label><input type="checkbox" data-scene-source value="${escapeHTML(source.id)}" ${sourceIds.has(source.id) ? 'checked' : ''}> ${escapeHTML(source.title)}</label>`).join('')}</fieldset>` : ''}
          <div class="scene-options">
            <label class="toggle"><input type="checkbox" data-scene-factual checked ${disabled ? 'disabled' : ''}><span></span> Les modifications de narration peuvent contenir des affirmations factuelles</label>
            <span>Visuel : ${escapeHTML(scene.provider || 'local')} ${scene.model ? `· ${escapeHTML(scene.model)}` : ''}</span>
          </div>
          <div class="scene-narration-evidence"><span>Narration : ${escapeHTML(scene.narrationProvider || 'non générée')}${scene.narrationModel ? ` · ${escapeHTML(scene.narrationModel)}` : ''}${scene.narrationTaskId ? ` · tâche ${escapeHTML(scene.narrationTaskId)}` : ''}</span>${scene.narrationError ? `<span class="danger-text">${escapeHTML(scene.narrationError)}</span>` : ''}</div>
          ${canReview ? `<div class="scene-actions">
            <button type="button" class="text-button" data-scene-move="up" ${disabled || index === 0 ? 'disabled' : ''}>↑ Plus tôt</button>
            <button type="button" class="text-button" data-scene-move="down" ${disabled || index === scenes.length - 1 ? 'disabled' : ''}>↓ Plus tard</button>
            <button type="button" class="text-button approve" data-scene-save ${disabled ? 'disabled' : ''}>Enregistrer la scène</button>
            <button type="button" class="text-button" data-scene-narration ${disabled ? 'disabled' : ''}>Régénérer uniquement la narration</button>
            <button type="button" class="text-button" data-scene-regenerate ${disabled ? 'disabled' : ''}>Régénérer la scène</button>
            <label class="text-button upload-button ${disabled ? 'disabled' : ''}">Remplacer la ressource<input type="file" data-scene-upload accept="image/png,image/jpeg,image/webp,video/mp4" ${disabled ? 'disabled' : ''}></label>
            <button type="button" class="text-button" data-scene-lock>${scene.locked ? 'Déverrouiller' : 'Verrouiller'}</button>
          </div>` : ''}
        </article>`;
      }).join('')}
    </div>
  </section>`;
}

function renderShortsStudio(item) {
  if (!item.assets?.finalVideo?.path || item.assets.finalVideo.simulated) return '';
  const clips = item.shorts || [];
  const parentApproved = item.review_status === 'approved';
  return `<section class="shorts-studio">
    <div class="panel-heading shorts-heading">
      <div><p class="eyebrow">ATELIER DE RECYCLAGE EN SHORTS</p><h3>Transformez une production en portée verticale</h3><p>Créez des extraits locaux au format 9:16 avec sous-titres mobiles. Les brouillons héritent des preuves de la production source et nécessitent toujours une approbation séparée.</p></div>
      <button type="button" class="button secondary small" data-propose-shorts="${escapeHTML(item.id)}">${clips.length ? 'Actualiser les brouillons' : 'Créer 3 brouillons de Short'}</button>
    </div>
    <div class="shorts-evidence ${parentApproved ? 'ready' : ''}">
      <span>${parentApproved ? '✓ Production source approuvée' : 'Approbation de la source requise avant la planification'}</span>
      <span>${escapeHTML(item.provenance?.status === 'verified' ? 'Preuves vérifiées' : item.provenance?.status === 'not_required' ? 'Aucune affirmation factuelle déclarée' : 'Revue des preuves incomplète')}</span>
      <span>Rendu local · aucun nouvel appel fournisseur</span>
    </div>
    ${clips.length ? `<div class="shorts-grid">${clips.map(clip => {
      const locked = ['scheduled', 'uploading', 'published', 'reconciliation_required'].includes(clip.status);
      const rendered = Boolean(clip.assetUrls?.video);
      return `<article class="short-card" data-short-card="${escapeHTML(clip.id)}">
        <div class="short-preview">${rendered
          ? `<video controls preload="metadata"><source src="${escapeHTML(clip.assetUrls.video)}" type="video/mp4"></video>`
          : `<div class="short-placeholder"><strong>9:16</strong><span>mise en page ${escapeHTML(label(clip.layout))}</span></div>`}</div>
        <div class="short-editor">
          <div class="scene-status-row">${statusChip(clip.status)}<span>${Number(clip.duration || 0).toFixed(0)}s</span><span>${escapeHTML((clip.sourceSceneLabels || []).join(' + '))}</span></div>
          <label><span>Titre du Short</span><input data-short-field="title" maxlength="100" value="${escapeHTML(clip.title)}" ${locked ? 'disabled' : ''}></label>
          <label><span>Description et appel à l’action vers la vidéo parente</span><textarea data-short-field="description" rows="3" maxlength="5000" ${locked ? 'disabled' : ''}>${escapeHTML(clip.description)}</textarea></label>
          <label><span>Tags</span><input data-short-field="tags" value="${escapeHTML((clip.tags || []).join(', '))}" ${locked ? 'disabled' : ''}></label>
          <div class="form-grid two">
            <label><span>Mise en page verticale</span><select data-short-field="layout" ${locked ? 'disabled' : ''}><option value="blur" ${clip.layout === 'blur' ? 'selected' : ''}>Fond flouté</option><option value="crop" ${clip.layout === 'crop' ? 'selected' : ''}>Recadrage centré</option><option value="stacked" ${clip.layout === 'stacked' ? 'selected' : ''}>Focus empilé</option></select></label>
            <label><span>Heure de publication</span><input data-short-field="publishTime" type="datetime-local" value="${toLocalInput(clip.publishTime)}" ${locked ? 'disabled' : ''}></label>
            <label><span>Confidentialité</span><select data-short-field="privacyStatus" ${locked ? 'disabled' : ''}><option value="private" ${clip.privacyStatus === 'private' ? 'selected' : ''}>Privé</option><option value="unlisted" ${clip.privacyStatus === 'unlisted' ? 'selected' : ''}>Non répertorié</option><option value="public" ${clip.privacyStatus === 'public' ? 'selected' : ''}>Public</option></select></label>
          </div>
          <p class="short-rationale">${escapeHTML(clip.rationale || '')}${clip.error ? `<br><span class="danger-text">${escapeHTML(clip.error)}</span>` : ''}</p>
          ${clip.youtubeUrl ? `<a class="source-link" href="${escapeHTML(clip.youtubeUrl)}" target="_blank" rel="noopener">Ouvrir le Short publié ↗</a>` : ''}
          ${!locked ? `<div class="short-actions"><button type="button" class="text-button" data-short-save>Enregistrer le brouillon</button><button type="button" class="button secondary small" data-short-render>${rendered ? 'Rendre à nouveau' : 'Rendre en 9:16'}</button><button type="button" class="button primary small" data-short-approve ${!parentApproved || clip.status !== 'rendered' ? 'disabled' : ''} title="${!parentApproved ? 'Approuvez d’abord la production source' : clip.status !== 'rendered' ? 'Rendez d’abord ce Short' : 'Confirmer et planifier ce Short'}">Approuver et planifier</button></div>` : ''}
        </div>
      </article>`;
    }).join('')}</div>` : '<p class="empty-inline">Aucun brouillon de Short pour le moment. Créez trois candidats à partir de la chronologie de scènes actuelle sans appeler de fournisseur payant.</p>'}
  </section>`;
}

async function openContent(productionId) {
  $('#loading').classList.add('active');
  try {
    const item = await api(`/api/content/${encodeURIComponent(productionId)}`);
    const data = item.editorData || {};
    const title = data.title || item.seo?.title || item.script?.title || item.strategy?.topic || 'Contenu sans titre';
    const description = data.description || item.seo?.description || '';
    const tags = data.tags || item.seo?.tags || [];
    const publishTime = item.schedule?.publish_time || data.publishTime || item.scheduled_publish_time;
    const canReview = !['published'].includes(item.schedule?.status);
    const experiment = data.packagingExperiment;
    const selectedTitleVariant = Number(data.selectedTitleVariant || 0);
    const selectedThumbnailVariant = Number(data.selectedThumbnailVariant || 0);
    $('#content-detail').innerHTML = `
      <div class="dialog-heading"><div><p class="eyebrow">REVUE DE CONTENU</p><h2>${escapeHTML(title)}</h2><div class="meta-line">${statusChip(item.schedule?.status || item.review_status || item.status)} · Qualité ${qualityScore(item.qualityChecks)}%</div></div><button type="button" class="close-button" data-close>×</button></div>
      <form id="content-review-form" class="editor content-review-editor">
        <div class="content-layout">
          <div>
            <div class="preview">${item.assetUrls.video ? `<video controls preload="metadata" poster="${item.assetUrls.thumbnail || ''}"><source src="${item.assetUrls.video}" type="video/mp4"></video>` : item.assetUrls.thumbnail ? `<img src="${item.assetUrls.thumbnail}" alt="Miniature générée">` : '<div class="preview-placeholder">Aucun aperçu lisible n’a été produit.</div>'}</div>
            <div class="quality-grid">${(item.qualityChecks || []).map(check => `<div class="quality-check ${check.passed ? 'pass' : 'fail'}">${check.passed ? '✓' : '×'} ${escapeHTML(check.message)}</div>`).join('') || '<div class="quality-check">Aucun résultat de qualité enregistré.</div>'}</div>
            ${item.review_notes ? `<p class="callout">${escapeHTML(item.review_notes)}</p>` : ''}
          </div>
          <div class="editor">
            <label><span>Titre</span><input name="title" maxlength="100" value="${escapeHTML(title)}" required></label>
            <label><span>Description</span><textarea name="description" rows="7">${escapeHTML(description)}</textarea></label>
            <label><span>Tags</span><input name="tags" value="${escapeHTML(tags.join(', '))}"></label>
            ${experiment ? `<section class="experiment-panel">
              <div><p class="eyebrow">EXPÉRIENCE D’APPRENTISSAGE APPROUVÉE</p><strong>${escapeHTML(experiment.hypothesis)}</strong><p>Choisissez la présentation à publier. Rien ne change sur YouTube tant que ce contenu n’est pas approuvé et publié.</p></div>
              <label><span>Variante de titre</span><select name="selectedTitleVariant">${experiment.titleVariants.map((variant, index) => `<option value="${index}" data-title="${escapeHTML(variant.title)}" ${index === selectedTitleVariant ? 'selected' : ''}>${escapeHTML(variant.label)} — ${escapeHTML(variant.title)}</option>`).join('')}</select></label>
              <div class="experiment-thumbnails">${experiment.thumbnailVariants.map((variant, index) => `<label class="experiment-thumb ${index === selectedThumbnailVariant ? 'selected' : ''}"><input type="radio" name="selectedThumbnailVariant" value="${index}" ${index === selectedThumbnailVariant ? 'checked' : ''}><img src="${escapeHTML(item.assetUrls.experimentThumbnails?.[index] || '')}" alt="variante de miniature ${escapeHTML(variant.label)}"><span>${escapeHTML(variant.label)}</span></label>`).join('')}</div>
            </section>` : ''}
          </div>
        </div>
        ${renderSceneEditor(item, canReview)}
        ${renderShortsStudio(item)}
        ${renderDiscoverabilityPanel(item)}
        ${renderProvenanceEditor(item.provenance, canReview)}
          <div class="form-grid two">
            <label><span>Heure de publication</span><input name="publishTime" type="datetime-local" value="${toLocalInput(publishTime)}"></label>
            <label><span>Confidentialité</span><select name="privacyStatus"><option value="private" ${data.privacyStatus === 'private' ? 'selected' : ''}>Privé</option><option value="unlisted" ${data.privacyStatus === 'unlisted' ? 'selected' : ''}>Non répertorié</option><option value="public" ${data.privacyStatus === 'public' ? 'selected' : ''}>Public</option></select></label>
          </div>
          <div class="settings-row">
            <label class="toggle"><input name="factChecked" type="checkbox" ${data.factChecked ? 'checked' : ''}><span></span> Faits et affirmations vérifiés</label>
            <label class="toggle"><input name="rightsConfirmed" type="checkbox" ${data.rightsConfirmed ? 'checked' : ''}><span></span> Droits des médias confirmés</label>
          </div>
          ${item.schedule && !['published', 'uploading', 'uploaded', 'reconciliation_required'].includes(item.schedule.status) ? `<div class="form-actions"><button type="button" class="button secondary" data-reschedule-content="${escapeHTML(item.id)}">Replanifier</button><button type="button" class="button primary" data-publish-now-content="${escapeHTML(item.id)}">Publier maintenant</button><button type="button" class="button danger" data-delete-schedule="${escapeHTML(item.id)}">Supprimer la planification</button></div>` : ''}
          ${canReview ? `<div class="form-actions"><button type="button" class="button primary" data-approve-content="${escapeHTML(item.id)}">Approuver et planifier</button><button type="button" class="button secondary" data-save-content="${escapeHTML(item.id)}">Enregistrer le brouillon</button><button type="button" class="button danger" data-reject-content="${escapeHTML(item.id)}">Rejeter</button><button type="button" class="button ghost" data-retry-content="${escapeHTML(item.id)}">Régénérer</button></div>` : `<a class="button secondary" href="${escapeHTML(item.schedule?.youtube_url || '#')}" target="_blank" rel="noopener">Ouvrir sur YouTube</a>`}
      </form>`;
    $('#content-review-form').dataset.productionId = item.id;
    $('#content-dialog').showModal();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    $('#loading').classList.remove('active');
  }
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return escapeHTML(new Date(date.getTime() - offset).toISOString().slice(0, 16));
}

function contentFormData() {
  const form = $('#content-review-form');
  const values = Object.fromEntries(new FormData(form));
  return {
    title: values.title,
    description: values.description,
    tags: values.tags,
    publishTime: values.publishTime ? new Date(values.publishTime).toISOString() : undefined,
    privacyStatus: values.privacyStatus,
    selectedTitleVariant: values.selectedTitleVariant,
    selectedThumbnailVariant: values.selectedThumbnailVariant,
    factChecked: form.elements.factChecked?.checked || false,
    rightsConfirmed: form.elements.rightsConfirmed?.checked || false
  };
}

function sceneFormData(card) {
  return {
    label: card.querySelector('[data-scene-field="label"]').value,
    duration: Number(card.querySelector('[data-scene-field="duration"]').value),
    scriptText: card.querySelector('[data-scene-field="scriptText"]').value,
    prompt: card.querySelector('[data-scene-field="prompt"]').value,
    provenanceSourceIds: Array.from(card.querySelectorAll('[data-scene-source]:checked')).map(input => input.value),
    factualChange: card.querySelector('[data-scene-factual]')?.checked !== false
  };
}

function shortFormData(card) {
  const publishTime = card.querySelector('[data-short-field="publishTime"]')?.value;
  return {
    title: card.querySelector('[data-short-field="title"]')?.value,
    description: card.querySelector('[data-short-field="description"]')?.value,
    tags: card.querySelector('[data-short-field="tags"]')?.value,
    layout: card.querySelector('[data-short-field="layout"]')?.value,
    publishTime: publishTime ? new Date(publishTime).toISOString() : undefined,
    privacyStatus: card.querySelector('[data-short-field="privacyStatus"]')?.value
  };
}

async function refreshContentDialog(productionId, message) {
  if (message) showToast(message);
  if ($('#content-dialog').open) $('#content-dialog').close();
  await refreshDashboard(true);
  await openContent(productionId);
}

async function uploadSceneAsset(productionId, sceneId, file) {
  if (!confirm('Confirmez que vous possédez ou avez l’autorisation d’utiliser cette ressource de remplacement.')) return;
  const synthetic = confirm('Ce remplacement contient-il des médias modifiés ou synthétiques réalistes devant être divulgués à YouTube ?');
  $('#loading').classList.add('active');
  try {
    await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}/asset`, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
        'x-file-name': file.name,
        'x-rights-confirmed': 'true',
        'x-synthetic-media': String(synthetic)
      }
    });
    await refreshContentDialog(productionId, 'Ressource de scène remplacée. Reconstruisez avant approbation.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    $('#loading').classList.remove('active');
  }
}

function provenanceFormData() {
  const sources = $$('[data-provenance-source]').map(item => ({
    id: item.dataset.id,
    url: item.querySelector('[data-field="url"]').value,
    title: item.querySelector('[data-field="title"]').value,
    publisher: item.querySelector('[data-field="publisher"]').value,
    sourceType: item.querySelector('[data-field="sourceType"]').value,
    status: item.querySelector('[data-field="status"]').value,
    notes: item.querySelector('[data-field="notes"]').value,
    publishedAt: item.dataset.publishedAt || null,
    accessedAt: item.dataset.accessedAt || null
  }));
  const claims = $$('[data-provenance-claim]').map(item => ({
    id: item.dataset.id,
    text: item.querySelector('[data-field="text"]').value,
    riskLevel: item.querySelector('[data-field="riskLevel"]').value,
    status: item.querySelector('[data-field="status"]').value,
    notes: item.querySelector('[data-field="notes"]').value,
    sourceIds: [...item.querySelectorAll('[data-claim-source]:checked')].map(input => input.dataset.claimSource)
  }));
  return {
    sources,
    claims,
    containsSyntheticMedia: $('#contains-synthetic-media')?.checked || false
  };
}

function clientId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${uuid}`;
}

function currentSourceOptions() {
  return $$('[data-provenance-source]').map(item => ({
    id: item.dataset.id,
    title: item.querySelector('[data-field="title"]').value || item.querySelector('[data-field="url"]').value || 'Nouvelle source'
  }));
}

async function persistProvenance(productionId, successMessage = null) {
  $('#loading').classList.add('active');
  try {
    const result = await api(`/api/content/${encodeURIComponent(productionId)}/provenance`, {
      method: 'PUT',
      body: JSON.stringify(provenanceFormData())
    });
    if (successMessage) {
      showToast(successMessage);
      $('#content-dialog').close();
      await openContent(productionId);
    }
    return result;
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  } finally {
    $('#loading').classList.remove('active');
  }
}

async function mutate(url, method, body, successMessage) {
  $('#loading').classList.add('active');
  try {
    const result = await api(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    showToast(successMessage);
    await refreshDashboard(true);
    return result;
  } catch (error) {
    const failures = error.data?.quality?.blockingFailures;
    showToast(failures ? `${error.message}: ${failures.join(', ')}` : error.message, 'error');
    throw error;
  } finally {
    $('#loading').classList.remove('active');
  }
}

document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-view]');
  if (nav) return switchView(nav.dataset.view);
  const go = event.target.closest('[data-go]');
  if (go) return switchView(go.dataset.go);
  if (event.target.closest('[data-close]')) return event.target.closest('dialog').close();

  const open = event.target.closest('[data-open-content]');
  if (open) return openContent(open.dataset.openContent);

  const cancel = event.target.closest('[data-cancel-job]');
  if (cancel && confirm('Annuler cette tâche de génération après son étape actuelle ?')) {
    await mutate(`/api/jobs/${encodeURIComponent(cancel.dataset.cancelJob)}/cancel`, 'POST', {}, 'Annulation demandée.').catch(() => {});
  }

  const idea = event.target.closest('[data-generate-idea]');
  if (idea) {
    await mutate(`/api/ideas/${encodeURIComponent(idea.dataset.generateIdea)}/generate`, 'POST', { length: 'medium' }, 'Idée mise en file pour génération.').catch(() => {});
  }

  const resume = event.target.closest('[data-resume-job]');
  if (resume) {
    const jobId = resume.dataset.resumeJob;
    const select = $$('[data-resume-stage-for]').find(item => item.dataset.resumeStageFor === jobId);
    const stage = select?.value;
    if (confirm(`Reprendre cette tâche depuis ${label(stage)} ? Les points de contrôle suivants seront régénérés.`)) {
      await mutate(`/api/jobs/${encodeURIComponent(jobId)}/resume`, 'POST', { stage }, `Génération reprise depuis ${label(stage)}.`).catch(() => {});
    }
  }

  const learning = event.target.closest('[data-learning-action]');
  if (learning) {
    const action = learning.dataset.learningAction;
    const id = learning.dataset.learningId;
    const message = action === 'approve'
      ? 'Apprentissage approuvé pour les futurs plans autonomes.'
      : 'Apprentissage rejeté et exclu des futurs plans.';
    await mutate(`/api/learning/recommendations/${encodeURIComponent(id)}/${action}`, 'POST', {}, message).catch(() => {});
  }

  const experiment = event.target.closest('[data-experiment-action]');
  if (experiment) {
    const action = experiment.dataset.experimentAction;
    const id = experiment.dataset.experimentId;
    const prompts = {
      approve: 'Approuver ce plan d’expérience complet ? Cela ne modifie pas encore YouTube.',
      start: 'Démarrer ce test en direct ? Lumen fera tourner uniquement les variantes approuvées et restaurera le témoin avant de vous demander d’adopter un gagnant.',
      adopt: 'Adopter sur YouTube le gagnant confirmé par les preuves et approuver son apprentissage pour les futurs plans ?',
      cancel: 'Annuler cette expérience et restaurer le titre et la miniature témoins ?'
    };
    if (prompts[action] && !confirm(prompts[action])) return;
    const messages = {
      approve: 'Plan d’expérience approuvé.',
      start: 'Expérience contrôlée démarrée.',
      refresh: 'Preuves de l’expérience actualisées.',
      adopt: 'Gagnant adopté et approuvé pour la planification future.',
      cancel: 'Expérience annulée et témoin restauré.'
    };
    await mutate(`/api/experiments/${encodeURIComponent(id)}/${action}`, 'POST', prompts[action] ? { confirmed: true } : {}, messages[action]).catch(() => {});
  }

  const refreshRetention = event.target.closest('#refresh-retention-button');
  if (refreshRetention?.dataset.videoId) {
    refreshRetention.disabled = true;
    try {
      await api(`/api/retention/${encodeURIComponent(refreshRetention.dataset.videoId)}/refresh`, {
        method: 'POST',
        body: JSON.stringify({ measurementWindow: refreshRetention.dataset.measurementWindow || 'rolling' })
      });
      showToast('Courbe de rétention actualisée depuis YouTube Analytics.');
      await refreshDashboard(true);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      refreshRetention.disabled = false;
    }
  }

  const syncEngagement = event.target.closest('#engagement-sync-button');
  if (syncEngagement?.dataset.videoId) {
    syncEngagement.disabled = true;
    try {
      await mutate(`/api/engagement/${encodeURIComponent(syncEngagement.dataset.videoId)}/sync`, 'POST', { analyze: true }, 'Commentaires synchronisés depuis YouTube.');
      ui.engagementDetail = null;
      renderEngagement(ui.state?.engagement || {});
    } catch (_error) { /* toast shown */ } finally {
      syncEngagement.disabled = false;
    }
  }

  const draftEngagement = event.target.closest('#engagement-draft-button');
  if (draftEngagement?.dataset.videoId) {
    draftEngagement.disabled = true;
    try {
      await mutate(`/api/engagement/${encodeURIComponent(draftEngagement.dataset.videoId)}/draft-replies`, 'POST', {}, 'Brouillons de réponses créés pour revue.');
      ui.engagementDetail = null;
      renderEngagement(ui.state?.engagement || {});
    } catch (_error) { /* toast shown */ } finally {
      draftEngagement.disabled = false;
    }
  }

  const replySave = event.target.closest('[data-reply-save]');
  if (replySave) {
    const card = replySave.closest('[data-reply-card]');
    const text = card?.querySelector('[data-reply-text]')?.value || '';
    await mutate(`/api/engagement/replies/${encodeURIComponent(replySave.dataset.replySave)}`, 'PATCH', { editedText: text }, 'Brouillon de réponse mis à jour.').catch(() => {});
    ui.engagementDetail = null;
    renderEngagement(ui.state?.engagement || {});
  }

  const replyDiscard = event.target.closest('[data-reply-discard]');
  if (replyDiscard) {
    await mutate(`/api/engagement/replies/${encodeURIComponent(replyDiscard.dataset.replyDiscard)}`, 'PATCH', { discard: true }, 'Brouillon de réponse ignoré.').catch(() => {});
    ui.engagementDetail = null;
    renderEngagement(ui.state?.engagement || {});
  }

  const replyApprove = event.target.closest('[data-reply-approve]');
  if (replyApprove) {
    const card = replyApprove.closest('[data-reply-card]');
    const text = card?.querySelector('[data-reply-text]')?.value || '';
    if (!text.trim()) return showToast('Le texte de la réponse est vide.', 'error');
    if (confirm(`Publier cette réponse sur YouTube ?\n\n${text}`)) {
      await mutate(`/api/engagement/replies/${encodeURIComponent(replyApprove.dataset.replyApprove)}/approve`, 'POST', { confirmed: true, editedText: text }, 'Réponse publiée sur YouTube.').catch(() => {});
      ui.engagementDetail = null;
      renderEngagement(ui.state?.engagement || {});
    }
  }

  const proposeShorts = event.target.closest('[data-propose-shorts]');
  if (proposeShorts) {
    const productionId = proposeShorts.dataset.proposeShorts;
    const replacing = Boolean(document.querySelector('[data-short-card]'));
    if (replacing && !confirm('Remplacer les brouillons de Short actuellement modifiables ? Les fichiers de brouillon déjà rendus resteront sur le disque, mais leur manifeste sera remplacé.')) return;
    try {
      await api(`/api/content/${encodeURIComponent(productionId)}/shorts/propose`, {
        method: 'POST', body: JSON.stringify({ count: 3, replace: replacing })
      });
      await refreshContentDialog(productionId, 'Trois brouillons de Short locaux créés à partir de la chronologie de scènes actuelle.');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const discoverabilityRun = event.target.closest('[data-discoverability-run]');
  if (discoverabilityRun) {
    const productionId = discoverabilityRun.dataset.discoverabilityRun;
    try {
      await api(`/api/content/${encodeURIComponent(productionId)}/discoverability/run`, {
        method: 'POST', body: JSON.stringify({ platform: 'youtube' })
      });
      await refreshContentDialog(productionId, 'Vérification de découvrabilité actualisée. Les résultats restent consultatifs jusqu’à leur revue.');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const discoverabilityReview = event.target.closest('[data-discoverability-accept], [data-discoverability-dismiss]');
  if (discoverabilityReview) {
    const card = discoverabilityReview.closest('[data-discoverability-finding]');
    const productionId = $('#content-review-form')?.dataset.productionId;
    if (!card || !productionId) return;
    const status = discoverabilityReview.matches('[data-discoverability-dismiss]') ? 'dismissed' : 'accepted';
    const reason = status === 'dismissed'
      ? (prompt('Pourquoi ce résultat est-il un faux positif ? La raison sera conservée pour les futurs audits correspondants.') || '')
      : '';
    if (status === 'dismissed' && !reason) return;
    try {
      await api(`/api/discoverability/findings/${encodeURIComponent(card.dataset.discoverabilityFinding)}`, {
        method: 'PATCH', body: JSON.stringify({ status, reason })
      });
      await refreshContentDialog(productionId, status === 'dismissed' ? 'Résultat ignoré avec justification du relecteur.' : 'Résultat conservé comme recommandation actionnable.');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const shortAction = event.target.closest('[data-short-save], [data-short-render], [data-short-approve]');
  if (shortAction) {
    const card = shortAction.closest('[data-short-card]');
    const productionId = $('#content-review-form')?.dataset.productionId;
    const clipId = card?.dataset.shortCard;
    if (!productionId || !clipId) return;
    try {
      const values = shortFormData(card);
      await api(`/api/content/${encodeURIComponent(productionId)}/shorts/${encodeURIComponent(clipId)}`, {
        method: 'PATCH', body: JSON.stringify(values)
      });
      if (shortAction.matches('[data-short-save]')) {
        await refreshContentDialog(productionId, 'Brouillon de Short enregistré.');
        return;
      }
      if (shortAction.matches('[data-short-render]')) {
        await api(`/api/content/${encodeURIComponent(productionId)}/shorts/${encodeURIComponent(clipId)}/render`, {
          method: 'POST', body: '{}'
        });
        await refreshContentDialog(productionId, 'Short vertical rendu localement avec sous-titres mobiles.');
        return;
      }
      if (!confirm('Confirmer les preuves héritées, les droits des médias, la confidentialité et l’heure de publication de ce Short ?')) return;
      await api(`/api/content/${encodeURIComponent(productionId)}/shorts/${encodeURIComponent(clipId)}/approve`, {
        method: 'POST', body: JSON.stringify({ ...values, confirmed: true })
      });
      await refreshContentDialog(productionId, 'Short approuvé et ajouté au calendrier de publication.');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const sceneButton = event.target.closest('[data-scene-save], [data-scene-narration], [data-scene-regenerate], [data-scene-lock], [data-scene-move]');
  if (sceneButton) {
    const card = sceneButton.closest('[data-scene-card]');
    const productionId = $('#content-review-form')?.dataset.productionId;
    const sceneId = card?.dataset.sceneCard;
    if (!productionId || !sceneId) return;
    try {
      if (sceneButton.matches('[data-scene-lock]')) {
        await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}`, {
          method: 'PATCH', body: JSON.stringify({ locked: !card.classList.contains('locked') })
        });
        await refreshContentDialog(productionId, card.classList.contains('locked') ? 'Scène déverrouillée.' : 'Scène verrouillée.');
        return;
      }
      if (sceneButton.matches('[data-scene-move]')) {
        const cards = $$('[data-scene-card]');
        const index = cards.indexOf(card);
        const target = sceneButton.dataset.sceneMove === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= cards.length) return;
        const ids = cards.map(item => item.dataset.sceneCard);
        [ids[index], ids[target]] = [ids[target], ids[index]];
        await api(`/api/content/${encodeURIComponent(productionId)}/scenes/reorder`, {
          method: 'POST', body: JSON.stringify({ sceneIds: ids })
        });
        await refreshContentDialog(productionId, 'Ordre de la chronologie mis à jour. Reconstruisez avant approbation.');
        return;
      }
      await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}`, {
        method: 'PATCH', body: JSON.stringify(sceneFormData(card))
      });
      if (sceneButton.matches('[data-scene-save]')) {
        await refreshContentDialog(productionId, 'Brouillon de scène enregistré.');
        return;
      }
      if (sceneButton.matches('[data-scene-narration]')) {
        if (!confirm('Régénérer la narration uniquement pour cette scène ? Cela peut consommer des crédits du fournisseur TTS ; la facture du fournisseur fait foi.')) return;
        await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}/narration`, {
          method: 'POST', body: JSON.stringify({ confirmCost: true })
        });
        await refreshContentDialog(productionId, 'Narration de la scène régénérée. Reconstruisez la vidéo finale une fois tous les segments de narration prêts.');
        return;
      }
      const estimate = await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}/estimate`);
      const message = estimate.paid
        ? `Régénérer uniquement cette scène avec ${estimate.provider} (${estimate.generatedSeconds}s). Cela consomme des crédits fournisseur ; la facture du fournisseur fait foi. Continuer ?`
        : 'Régénérer uniquement cette scène avec le fournisseur d’images configuré ? Une requête d’image réelle peut consommer des crédits fournisseur. Continuer ?';
      if (!confirm(message)) return;
      await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}/regenerate`, {
        method: 'POST', body: JSON.stringify({ confirmPaid: estimate.paid })
      });
      await refreshContentDialog(productionId, 'Scène régénérée. Reconstruisez la vidéo finale une fois la chronologie prête.');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const silenceAction = event.target.closest('[data-intentional-silence], [data-require-narration]');
  if (silenceAction) {
    const productionId = $('#content-review-form')?.dataset.productionId;
    if (!productionId) return;
    const enabled = silenceAction.matches('[data-intentional-silence]');
    let reason = '';
    if (enabled) {
      reason = prompt('Pourquoi cette production est-elle intentionnellement silencieuse ? Cette raison est enregistrée avec les preuves d’approbation.') || '';
      if (!reason) return;
      if (!confirm('Confirmez que cette production est intentionnellement silencieuse. Les sous-titres et visuels resteront, et l’approbation enregistrera cette dérogation.')) return;
    } else if (!confirm('Exiger à nouveau une narration ? L’approbation sera bloquée tant que la narration manquante n’est pas régénérée et la vidéo reconstruite.')) {
      return;
    }
    try {
      await api(`/api/content/${encodeURIComponent(productionId)}/narration/silence`, {
        method: 'POST', body: JSON.stringify({ enabled, confirmed: enabled, reason })
      });
      await refreshContentDialog(productionId, enabled ? 'Silence intentionnel enregistré. Reconstruisez avant approbation.' : 'La narration est à nouveau requise.');
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const rebuildScenes = event.target.closest('[data-rebuild-scenes]');
  if (rebuildScenes) {
    const productionId = rebuildScenes.dataset.rebuildScenes;
    if (confirm('Reconstruire un nouveau MP4 final à partir de la chronologie de scènes actuelle ? La vidéo finale précédente sera conservée.')) {
      try {
        await api(`/api/content/${encodeURIComponent(productionId)}/scenes/rebuild`, { method: 'POST', body: '{}' });
        await refreshContentDialog(productionId, 'Vidéo finale reconstruite à partir de la chronologie réparée. Vérifiez-la avant approbation.');
      } catch (error) {
        showToast(error.message, 'error');
      }
    }
    return;
  }

  const addSource = event.target.closest('[data-add-provenance-source]');
  if (addSource) {
    const list = $('#provenance-sources');
    list.querySelector('.empty-inline')?.remove();
    list.insertAdjacentHTML('beforeend', renderSourceEditor({ id: clientId('source') }));
    return;
  }

  const addClaim = event.target.closest('[data-add-provenance-claim]');
  if (addClaim) {
    const list = $('#provenance-claims');
    list.querySelector('.empty-inline')?.remove();
    list.insertAdjacentHTML('beforeend', renderClaimEditor({ id: clientId('claim') }, currentSourceOptions()));
    return;
  }

  const removeProvenance = event.target.closest('[data-remove-provenance]');
  if (removeProvenance) {
    removeProvenance.closest('.provenance-item')?.remove();
    return;
  }

  const saveProvenance = event.target.closest('[data-save-provenance]');
  if (saveProvenance) {
    const productionId = $('#content-review-form')?.dataset.productionId;
    if (productionId) await persistProvenance(productionId, 'Revue des preuves enregistrée.').catch(() => {});
    return;
  }

  const save = event.target.closest('[data-save-content]');
  if (save) {
    try {
      await persistProvenance(save.dataset.saveContent);
      await mutate(`/api/content/${encodeURIComponent(save.dataset.saveContent)}`, 'PATCH', contentFormData(), 'Brouillon et revue des preuves enregistrés.');
    } catch (_error) { /* toast already shown */ }
  }

  const approve = event.target.closest('[data-approve-content]');
  if (approve) {
    try {
      await persistProvenance(approve.dataset.approveContent);
      await mutate(`/api/content/${encodeURIComponent(approve.dataset.approveContent)}/approve`, 'POST', contentFormData(), 'Contenu approuvé et planifié.');
      $('#content-dialog').close();
    } catch (_error) { /* toast already shown */ }
  }

  const reschedule = event.target.closest('[data-reschedule-content]');
  if (reschedule) {
    const publishTime = contentFormData().publishTime;
    if (!publishTime) return showToast('Choisissez d’abord une heure de publication future.', 'error');
    try {
      await mutate(`/api/content/${encodeURIComponent(reschedule.dataset.rescheduleContent)}/schedule`, 'PATCH', { publishTime }, 'Contenu replanifié.');
      await openContent(reschedule.dataset.rescheduleContent);
    } catch (_error) { /* toast already shown */ }
    return;
  }

  const publishNow = event.target.closest('[data-publish-now-content]');
  if (publishNow) {
    if (!confirm('Publier cette vidéo sur YouTube maintenant avec le paramètre de confidentialité sélectionné ?')) return;
    try {
      await mutate(`/api/content/${encodeURIComponent(publishNow.dataset.publishNowContent)}/publish-now`, 'POST', {}, 'Contenu publié.');
      $('#content-dialog').close();
    } catch (_error) { /* toast already shown */ }
    return;
  }

  const deleteSchedule = event.target.closest('[data-delete-schedule]');
  if (deleteSchedule) {
    if (!confirm('Supprimer cette entrée de planification ? Le contenu généré et les ressources seront conservés.')) return;
    try {
      await mutate(`/api/content/${encodeURIComponent(deleteSchedule.dataset.deleteSchedule)}/schedule`, 'DELETE', undefined, 'Planification supprimée ; le contenu généré a été conservé.');
      await openContent(deleteSchedule.dataset.deleteSchedule);
    } catch (_error) { /* toast already shown */ }
    return;
  }

  const reject = event.target.closest('[data-reject-content]');
  if (reject) {
    const notes = prompt('Pourquoi rejetez-vous ce contenu ?', 'Nécessite un angle différent');
    if (notes !== null) {
      await mutate(`/api/content/${encodeURIComponent(reject.dataset.rejectContent)}/reject`, 'POST', { notes }, 'Contenu rejeté.').catch(() => {});
      $('#content-dialog').close();
    }
  }

  const retry = event.target.closest('[data-retry-content]');
  if (retry && confirm('Générer une nouvelle version sur le même sujet ?')) {
    await mutate(`/api/content/${encodeURIComponent(retry.dataset.retryContent)}/retry`, 'POST', {}, 'Régénération démarrée.').catch(() => {});
    $('#content-dialog').close();
  }

  const editChannel = event.target.closest('[data-edit-channel]');
  if (editChannel) {
    const channel = (ui.state?.channels || []).find(item => item.id === editChannel.dataset.editChannel);
    if (!channel) return;
    const form = $('#channel-form');
    form.reset();
    form.elements.channelId.value = channel.id;
    form.elements.name.value = channel.name || '';
    form.elements.language.value = channel.content_language || 'fr';
    form.elements.defaultStyle.value = channel.default_style || 'explainer';
    form.elements.goal.value = channel.goal || '';
    form.elements.targetAudience.value = channel.target_audience || '';
    $('#channel-dialog-eyebrow').textContent = 'MODIFIER LA CHAÎNE';
    $('#channel-dialog-title').textContent = channel.name;
    $('#channel-form-submit').textContent = 'Enregistrer les modifications';
    $('#channel-dialog').showModal();
    return;
  }

  const deleteChannel = event.target.closest('[data-delete-channel]');
  if (deleteChannel) {
    if (!confirm('Supprimer cette chaîne ? Sa connexion YouTube sera retirée. Le contenu déjà généré reste sur le disque.')) return;
    await mutate(`/api/channels/${encodeURIComponent(deleteChannel.dataset.deleteChannel)}`, 'DELETE', undefined, 'Chaîne supprimée.').catch(() => {});
    return;
  }

  const refreshChannel = event.target.closest('[data-refresh-channel]');
  if (refreshChannel) {
    refreshChannel.disabled = true;
    await mutate(`/api/channels/${encodeURIComponent(refreshChannel.dataset.refreshChannel)}/refresh`, 'POST', {}, 'Statistiques YouTube actualisées.').catch(() => {});
    refreshChannel.disabled = false;
  }
});

document.addEventListener('change', event => {
  if (event.target.matches('#active-channel-select')) {
    setActiveChannel(event.target.value || null);
    refreshDashboard();
  }
  if (event.target.matches('#retention-snapshot-select')) {
    ui.retentionSnapshotId = event.target.value;
    renderRetention(ui.state?.learning?.retention || {});
  }
  if (event.target.matches('#engagement-video-select')) {
    ui.engagementVideoId = event.target.value;
    ui.engagementDetail = null;
    renderEngagement(ui.state?.engagement || {});
  }
  if (event.target.matches('[name="selectedTitleVariant"]')) {
    const title = event.target.selectedOptions[0]?.dataset.title;
    const input = $('#content-review-form [name="title"]');
    if (title && input) input.value = title;
  }
  if (event.target.matches('[data-scene-upload]')) {
    const file = event.target.files?.[0];
    const card = event.target.closest('[data-scene-card]');
    const productionId = $('#content-review-form')?.dataset.productionId;
    if (file && card && productionId) {
      uploadSceneAsset(productionId, card.dataset.sceneCard, file);
    }
  }
});

$('#generate-button').addEventListener('click', () => $('#generate-dialog').showModal());
$('#add-idea-button').addEventListener('click', () => $('#idea-dialog').showModal());
$('#add-channel-button').addEventListener('click', () => {
  const form = $('#channel-form');
  form.reset();
  form.elements.channelId.value = '';
  $('#channel-dialog-eyebrow').textContent = 'NOUVELLE CHAÎNE';
  $('#channel-dialog-title').textContent = 'Ajouter une chaîne';
  $('#channel-form-submit').textContent = 'Créer la chaîne';
  $('#channel-dialog').showModal();
});
$('#refresh-button').addEventListener('click', () => refreshDashboard());
$('#pipeline-filter').addEventListener('change', () => renderPipeline(ui.state?.pipeline || []));

$('#experiment-create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  await mutate('/api/experiments', 'POST', {
    productionId: values.productionId,
    armDurationHours: Number(values.armDurationHours),
    minImpressions: Number(values.minImpressions)
  }, 'Expérience de croissance en brouillon créée pour revue.').catch(() => {});
});

$('#run-readiness-button').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Exécution des vérifications en direct…';
  try {
    await mutate('/api/readiness/run', 'POST', {
      channelId: ui.activeChannelId,
      includePaidMedia: $('#paid-image-probe').checked,
      includePaidVideo: $('#paid-video-probe').checked
    }, 'Vérification de préparation de production terminée.');
    switchView('readiness');
  } catch (_error) { /* toast already shown */ }
  finally {
    button.disabled = false;
    button.textContent = 'Lancer la vérification';
  }
});

$('#automation-toggle').addEventListener('click', async () => {
  const action = ui.state?.system.automationPaused ? 'resume' : 'pause';
  const message = action === 'resume' ? 'Automatisation reprise.' : 'Automatisation mise en pause.';
  await mutate(`/api/automation/${action}`, 'POST', {}, message).catch(() => {});
});

function strategyFormData(status = ui.state?.channelStrategy?.status || 'draft') {
  const form = $('#strategy-form');
  const values = Object.fromEntries(new FormData(form));
  return {
    ...values,
    channelId: ui.activeChannelId,
    contentPillars: values.contentPillars.split(',').map(value => value.trim()).filter(Boolean),
    cadencePerWeek: Number(values.cadencePerWeek),
    videosPerRun: Number(values.videosPerRun),
    targetValue: values.targetValue === '' ? null : Number(values.targetValue),
    targetWindowDays: Number(values.targetWindowDays),
    monthlyBudget: values.monthlyBudget === '' ? null : Number(values.monthlyBudget),
    status
  };
}

$('#strategy-form').addEventListener('submit', async event => {
  event.preventDefault();
  await mutate('/api/operator/strategy', 'PUT', strategyFormData(), 'Stratégie de chaîne enregistrée.').catch(() => {});
});

$('#activate-operator-button').addEventListener('click', async () => {
  if (!$('#strategy-form').reportValidity()) return;
  await mutate('/api/operator/start', 'POST', strategyFormData('active'), 'Opérateur autonome démarré.').catch(() => {});
});

$('#pause-operator-button').addEventListener('click', async () => {
  await mutate('/api/operator/pause', 'POST', { channelId: ui.activeChannelId }, 'Opérateur autonome mis en pause.').catch(() => {});
});

$('#cancel-operator-run').addEventListener('click', async event => {
  const runId = event.currentTarget.dataset.runId;
  if (runId && confirm('Arrêter cette exécution autonome après l’étape actuelle de l’agent ?')) {
    await mutate(`/api/operator/runs/${encodeURIComponent(runId)}/cancel`, 'POST', {}, 'Arrêt de l’opérateur demandé.').catch(() => {});
  }
});

$('#resume-operator-run').addEventListener('click', async event => {
  const runId = event.currentTarget.dataset.runId;
  if (runId && confirm('Reprendre cette exécution de l’opérateur depuis son plan éditorial et ses points de contrôle de génération enregistrés ?')) {
    await mutate(`/api/operator/runs/${encodeURIComponent(runId)}/resume`, 'POST', {}, 'Opérateur autonome repris.').catch(() => {});
  }
});

$('#generate-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  if (!ui.activeChannelId) return showToast('Choisissez une chaîne active avant de générer une vidéo.', 'error');
  try {
    await mutate('/generate', 'POST', { ...values, channelId: ui.activeChannelId, topic: values.topic.trim() || null }, 'Tâche de génération démarrée.');
    $('#generate-dialog').close();
    event.currentTarget.reset();
  } catch (_error) { /* toast already shown */ }
});

$('#idea-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await mutate('/api/ideas', 'POST', { ...values, channelId: ui.activeChannelId }, 'Idée ajoutée au backlog.');
    $('#idea-dialog').close();
    event.currentTarget.reset();
  } catch (_error) { /* toast already shown */ }
});

$('#channel-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const channelId = values.channelId;
  delete values.channelId;
  try {
    if (channelId) {
      await mutate(`/api/channels/${encodeURIComponent(channelId)}`, 'PATCH', values, 'Chaîne mise à jour.');
    } else {
      await mutate('/api/channels', 'POST', values, 'Chaîne créée. Connectez-la à YouTube pour l’activer.');
    }
    $('#channel-dialog').close();
    event.currentTarget.reset();
  } catch (_error) { /* toast already shown */ }
});

$('#profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  values.bannedTopics = values.bannedTopics.split(',').map(value => value.trim()).filter(Boolean);
  try {
    await mutate('/api/profile', 'PUT', values, 'Configuration de la chaîne enregistrée.');
    await mutate('/api/settings', 'PUT', {
      approval_required: $('#approval-required').checked,
      notification_enabled: $('#notifications-enabled').checked,
      channel_timezone: values.timezone,
      video_provider: values.videoProvider,
      video_generation_mode: values.videoGenerationMode,
      video_clip_duration: Number(values.videoClipDuration),
      video_max_generated_seconds: Number(values.videoMaxGeneratedSeconds)
    }, 'Paramètres de l’opérateur enregistrés.');
  } catch (_error) { /* toast already shown */ }
});

$('#api-key-button').addEventListener('click', () => {
  if (requestApiKey() !== null) showToast('Clé API du tableau de bord enregistrée dans ce navigateur.');
});

const initialView = location.hash.slice(1);
if (['overview', 'channels', 'operator', 'pipeline', 'calendar', 'analytics', 'engagement', 'readiness', 'settings'].includes(initialView)) switchView(initialView);
refreshDashboard();
setInterval(() => refreshDashboard(true), 8000);
