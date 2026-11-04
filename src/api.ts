import { META_ACCESS_TOKEN, META_GRAPH_VERSION } from './config';
import type { AccountDataset, AdAccount, BreakdownRow, DashboardResponse, InsightRow } from './types';

const DASHBOARD_CACHE_PREFIX = 'meta-dashboard-cache:v1:';
export const DASHBOARD_CACHE_TTL_MS = 10 * 60_000;
type DashboardRequest = { accountIds: string[]; since: string; until: string; previousSince: string; previousUntil: string };

function dashboardCacheKey(input: DashboardRequest) {
  const accounts = input.accountIds.map(id => id.replace(/^act_/i, '')).sort();
  return `${DASHBOARD_CACHE_PREFIX}${accounts.join(',')}:${input.since}:${input.until}:${input.previousSince}:${input.previousUntil}`;
}

export function readDashboardCache(input: DashboardRequest): { response: DashboardResponse; fresh: boolean } | null {
  try {
    const stored = localStorage.getItem(dashboardCacheKey(input));
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { storedAt: number; response: DashboardResponse };
    if (!parsed?.response?.data || !Number.isFinite(parsed.storedAt)) return null;
    return { response: parsed.response, fresh: Date.now() - parsed.storedAt < DASHBOARD_CACHE_TTL_MS };
  } catch {
    return null;
  }
}

function writeDashboardCache(input: DashboardRequest, response: DashboardResponse) {
  try {
    const key = dashboardCacheKey(input);
    localStorage.setItem(key, JSON.stringify({ storedAt: Date.now(), response }));
    const entries = Object.keys(localStorage)
      .filter(item => item.startsWith(DASHBOARD_CACHE_PREFIX))
      .map(item => {
        try { return { key: item, storedAt: Number(JSON.parse(localStorage.getItem(item) || '{}').storedAt) || 0 }; }
        catch { return { key: item, storedAt: 0 }; }
      })
      .sort((a, b) => b.storedAt - a.storedAt);
    entries.slice(12).forEach(item => localStorage.removeItem(item.key));
  } catch {
    // A full browser storage quota must not prevent the dashboard from loading.
  }
}

export function hasMetaToken() {
  return META_ACCESS_TOKEN.trim().length > 20 && !META_ACCESS_TOKEN.toLowerCase().includes('cole_seu_token');
}

function graphUrl(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path.replace(/^\//, '')}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  });
  return url;
}

async function graphFetch(url: string | URL) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const code = payload?.error?.code;
    const message = code === 190
      ? 'O token do Meta é inválido ou expirou. Atualize VITE_META_ACCESS_TOKEN e recarregue o app.'
      : payload?.error?.message || `Meta Graph API retornou HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

async function graphPages(path: string, params: Record<string, string | number | undefined> = {}) {
  let next: string | URL | undefined = graphUrl(path, { ...params, limit: params.limit || 500 });
  const rows: any[] = [];
  let pageCount = 0;
  while (next && pageCount < 50) {
    const payload = await graphFetch(next);
    rows.push(...(payload.data || []));
    next = payload.paging?.next;
    pageCount++;
  }
  return rows;
}

export async function getAdAccounts(): Promise<AdAccount[]> {
  if (!hasMetaToken()) return [];
  return graphPages('me/adaccounts', { fields: 'id,name,account_id,currency,account_status' });
}

function numeric(value: unknown) {
  const result = Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(result) ? result : 0;
}

function actionTotals(actions: any[] = []) {
  const firstValue = (types: string[]) => {
    for (const type of types) {
      const found = actions.find(item => item.action_type === type && numeric(item.value) > 0);
      if (found) return numeric(found.value);
    }
    return 0;
  };
  const breakdown: Record<string, number> = {};
  actions.forEach(item => {
    const key = String(item.action_type || '');
    if (key) breakdown[key] = (breakdown[key] || 0) + numeric(item.value);
  });
  const leadTypes = ['onsite_conversion.lead_grouped', 'leadgen_grouped', 'lead', 'leadgen.other', 'offsite_conversion.fb_pixel_lead', 'offsite_conversion.lead'];
  const conversationTypes = ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_conversation_started', 'messaging_conversation_started_7d', 'messaging_conversation_started'];
  const profileTypes = ['instagram_profile_visit', 'instagram_profile_visits', 'onsite_conversion.instagram_profile_visit', 'onsite_conversion.instagram_profile_visits'];
  return {
    leads: firstValue(leadTypes), conversations: firstValue(conversationTypes), linkClicks: firstValue(['link_click']),
    profileVisits: firstValue(profileTypes), landingPageViews: firstValue(['landing_page_view']),
    postEngagement: firstValue(['post_engagement', 'page_engagement']),
    purchases: firstValue(['purchase', 'omni_purchase']),
    appInstalls: firstValue(['mobile_app_install', 'app_install']),
    videoViews: firstValue(['video_view', 'thruplay']),
    eventResponses: firstValue(['event_response', 'rsvp']),
    pageLikes: firstValue(['page_like', 'like', 'page_like_add']), breakdown,
  };
}

const isLeadObjective = (objective?: string | null) => ['OUTCOME_LEADS', 'LEAD_GENERATION'].includes(String(objective || '').toUpperCase());

function resultFor(actions: ReturnType<typeof actionTotals>, objective: string | null, optimizationGoal: string | null) {
  const goal = String(optimizationGoal || '').toUpperCase();
  const campaignObjective = String(objective || '').toUpperCase();
  const pick = (value: number, label: string) => ({ value, label });

  if (goal.includes('LEAD')) return pick(actions.leads, 'Leads');
  if (goal.includes('CONVERSATION') || goal.includes('MESSAGING')) return pick(actions.conversations, 'Conversas');
  if (goal.includes('PROFILE_VISIT')) return pick(actions.profileVisits, 'Visitas ao perfil');
  if (goal.includes('LANDING_PAGE_VIEW')) return pick(actions.landingPageViews, 'Visitas à página');
  if (goal.includes('LINK_CLICK')) return pick(actions.linkClicks, 'Cliques no link');
  if (goal.includes('ENGAGED_PAGE_VIEW')) return pick(actions.landingPageViews, 'Visitas à página');
  if (goal.includes('EVENT_RESPONSE')) return pick(actions.eventResponses, 'Respostas a eventos');
  if (goal.includes('PAGE_LIKE')) return pick(actions.pageLikes, 'Curtidas na página');
  if (goal.includes('POST_ENGAGEMENT') || goal.includes('PAGE_ENGAGEMENT') || goal.includes('ENGAGED_USER')) return pick(actions.postEngagement, 'Engajamentos');
  if (goal.includes('APP_INSTALL')) return pick(actions.appInstalls, 'Instalações');
  if (goal.includes('OFFSITE_CONVERSION') || goal.includes('PURCHASE') || goal.includes('VALUE')) {
    if (actions.purchases) return pick(actions.purchases, 'Compras');
    if (actions.leads) return pick(actions.leads, 'Leads');
    return pick(0, 'Conversões');
  }
  if (goal.includes('AD_RECALL')) return pick(actions.videoViews, 'Visualizações de vídeo');
  if (goal.includes('REACH')) return pick(0, 'Alcance');
  if (goal.includes('IMPRESSION')) return pick(0, 'Impressões');

  if (isLeadObjective(campaignObjective)) return pick(actions.leads, 'Leads');
  if (campaignObjective === 'OUTCOME_ENGAGEMENT') {
    if (actions.conversations) return pick(actions.conversations, 'Conversas');
    if (actions.postEngagement) return pick(actions.postEngagement, 'Engajamentos');
    if (actions.profileVisits) return pick(actions.profileVisits, 'Visitas ao perfil');
    return pick(0, 'Engajamentos');
  }
  if (campaignObjective === 'OUTCOME_TRAFFIC') {
    if (actions.landingPageViews) return pick(actions.landingPageViews, 'Visitas à página');
    if (actions.profileVisits) return pick(actions.profileVisits, 'Visitas ao perfil');
    return pick(actions.linkClicks, 'Cliques no link');
  }
  if (campaignObjective === 'OUTCOME_SALES') {
    if (actions.purchases) return pick(actions.purchases, 'Compras');
    if (actions.leads) return pick(actions.leads, 'Leads');
    return pick(0, 'Conversões');
  }
  if (campaignObjective === 'OUTCOME_AWARENESS') return pick(actions.videoViews, 'Visualizações de vídeo');
  if (actions.leads) return pick(actions.leads, 'Leads');
  if (actions.conversations) return pick(actions.conversations, 'Conversas');
  if (actions.landingPageViews) return pick(actions.landingPageViews, 'Visitas à página');
  if (actions.profileVisits) return pick(actions.profileVisits, 'Visitas ao perfil');
  if (actions.linkClicks) return pick(actions.linkClicks, 'Cliques no link');
  if (actions.purchases) return pick(actions.purchases, 'Compras');
  if (actions.postEngagement) return pick(actions.postEngagement, 'Engajamentos');
  return pick(0, 'Resultados');
}

function normalizeRow(row: any, account: AdAccount, objectives: Record<string, string | null>): InsightRow {
  const actions = actionTotals(row.actions || []);
  actions.linkClicks ||= numeric(row.inline_link_clicks);
  const objective = objectives[String(row.campaign_id || '')] || null;
  const optimizationGoal = row.optimization_goal || null;
  const result = resultFor(actions, objective, optimizationGoal);
  return {
    date_start: row.date_start || null, date_stop: row.date_stop || null,
    campaign_id: row.campaign_id || null, campaign_name: row.campaign_name || null,
    adset_id: row.adset_id || null, adset_name: row.adset_name || null,
    ad_id: row.ad_id || null, ad_name: row.ad_name || null,
    campaign_objective: objective, optimization_goal: optimizationGoal, is_lead_campaign: isLeadObjective(objective),
    impressions: numeric(row.impressions), reach: numeric(row.reach), spend: numeric(row.spend),
    clicks: numeric(row.clicks), link_clicks: actions.linkClicks, leads: actions.leads, results_form: actions.leads,
    conversations: actions.conversations, results_messaging: actions.conversations,
    profile_visits: actions.profileVisits, landing_page_views: actions.landingPageViews,
    results: result.value, result_label: result.label,
    action_breakdown: actions.breakdown, ad_account_id: account.id,
    account_name: account.name || account.account_id || account.id, currency: account.currency || 'BRL',
  };
}

async function fetchInsights(account: AdAccount, since: string, until: string, level: 'account' | 'adset' | 'ad', extra: { time_increment?: number; breakdowns?: string } = {}) {
  const accountId = `act_${String(account.account_id || account.id).replace(/^act_/, '')}`;
  const fields = [
    'date_start', 'date_stop',
    ...(level === 'account' ? [] : ['campaign_id', 'campaign_name']),
    ...(level === 'adset' || level === 'ad' ? ['adset_id', 'adset_name'] : []),
    ...(level === 'ad' ? ['ad_id', 'ad_name'] : []),
    'impressions', 'reach', 'spend', 'clicks', 'inline_link_clicks', 'actions',
    ...(level === 'account' ? [] : ['optimization_goal']),
  ].join(',');
  return graphPages(`${accountId}/insights`, {
    fields, level, time_range: JSON.stringify({ since, until }),
    ...(extra.time_increment ? { time_increment: extra.time_increment } : {}),
    ...(extra.breakdowns ? { breakdowns: extra.breakdowns } : {}),
  });
}

async function fetchAccountDataset(account: AdAccount, since: string, until: string, previousSince: string, previousUntil: string): Promise<AccountDataset> {
  const accountId = `act_${String(account.account_id || account.id).replace(/^act_/, '')}`;
  const campaigns = await graphPages(`${accountId}/campaigns`, { fields: 'id,name,objective' });
  const objectives = Object.fromEntries(campaigns.map(campaign => [String(campaign.id), campaign.objective || null]));
  const [accountRows, adsetRows, dailyRows, adRows, breakdownRows, previousAccount, previousCampaigns, adDetails] = await Promise.all([
    fetchInsights(account, since, until, 'account'),
    fetchInsights(account, since, until, 'adset'),
    fetchInsights(account, since, until, 'adset', { time_increment: 1 }),
    fetchInsights(account, since, until, 'ad'),
    fetchInsights(account, since, until, 'adset', { breakdowns: 'publisher_platform,platform_position' }),
    fetchInsights(account, previousSince, previousUntil, 'account'),
    fetchInsights(account, previousSince, previousUntil, 'adset'),
    graphPages(`${accountId}/ads`, { fields: 'id,name,creative{thumbnail_url,image_url}', effective_status: JSON.stringify(['ACTIVE', 'PAUSED', 'ARCHIVED']) }),
  ]);
  const details = new Map(adDetails.map((ad: any) => [String(ad.id), ad]));
  const normalize = (rows: any[]) => rows.map(row => normalizeRow(row, account, objectives));
  const creatives = normalize(adRows).map(ad => {
    const detail: any = details.get(String(ad.ad_id || ''));
    const creative = detail?.creative || {};
    return {
      ...ad, ad_name: detail?.name || ad.ad_name,
      thumbnail_url: creative.thumbnail_url || creative.image_url || null,
      image_url: creative.image_url || creative.thumbnail_url || null,
      cpl: ad.is_lead_campaign && ad.leads > 0 ? ad.spend / ad.leads : null,
    };
  }).sort((a, b) => b.spend - a.spend).slice(0, 50);
  const breakdown: BreakdownRow[] = breakdownRows.map((row: any) => {
    const action = actionTotals(row.actions || []);
    const objective = objectives[String(row.campaign_id || '')] || null;
    const position = String(row.platform_position || 'unknown').replace(/^(instagram|facebook|messenger)_/, '');
    return {
      key: `${row.publisher_platform || 'unknown'}_${position}`,
      platform: row.publisher_platform || 'unknown', position: row.platform_position || 'unknown',
      campaign_id: row.campaign_id || null, campaign_name: row.campaign_name || null,
      adset_id: row.adset_id || null, adset_name: row.adset_name || null,
      ad_account_id: account.id, is_lead_campaign: isLeadObjective(objective),
      spend: numeric(row.spend), impressions: numeric(row.impressions), clicks: numeric(row.clicks),
      leads: action.leads, conversations: action.conversations,
      results: resultFor({ ...action, linkClicks: action.linkClicks || numeric(row.inline_link_clicks) }, objective, row.optimization_goal || null).value,
    };
  });
  return {
    account: { id: account.id, name: account.name, currency: account.currency || 'BRL' },
    accountRows: normalize(accountRows), campaigns: normalize(adsetRows), daily: normalize(dailyRows), creatives, breakdown,
    previousAccountRows: normalize(previousAccount), previousCampaigns: normalize(previousCampaigns),
  };
}

export async function loadDashboard(input: { accounts: AdAccount[]; accountIds: string[]; since: string; until: string; previousSince: string; previousUntil: string }): Promise<DashboardResponse> {
  if (!hasMetaToken()) throw new Error('Configure VITE_META_ACCESS_TOKEN em .env.local e reinicie o app.');
  const selected = new Set(input.accountIds);
  const accounts = input.accounts.filter(account => selected.has(account.id));
  const results = await Promise.all(accounts.map(async account => {
    try { return { ok: true as const, data: await fetchAccountDataset(account, input.since, input.until, input.previousSince, input.previousUntil) }; }
    catch (error) { return { ok: false as const, account: account.name || account.id, error: error instanceof Error ? error.message : 'Falha ao consultar esta conta.' }; }
  }));
  const data = results.filter((result): result is Extract<typeof result, { ok: true }> => result.ok).map(result => result.data);
  const errors = results.filter((result): result is Extract<typeof result, { ok: false }> => !result.ok).map(({ account, error }) => ({ account, error }));
  const response = { data, errors, fetchedAt: new Date().toISOString(), partial: errors.length > 0 };
  if (data.length > 0 && errors.length === 0) writeDashboardCache(input, response);
  return response;
}
