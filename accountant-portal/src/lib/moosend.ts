const API_KEY = process.env.MOOSEND_API_KEY;
const BASE_URL = "https://api.moosend.com/v3";
const SENDER_EMAIL = process.env.MOOSEND_SENDER_EMAIL ?? 'info@i-mentor.gr'
const REPLY_TO_EMAIL = process.env.MOOSEND_REPLY_TO_EMAIL ?? 'info@i-mentor.gr'

// Send ONE Moosend campaign for all recipients using custom-field merge tags.
// This creates exactly 1 Moosend list + 1 Moosend campaign per GEMI campaign,
// regardless of recipient count. Personalization is done via [subscription.var] tags.
export async function sendMoosendBulkPersonalized(opts: {
  recipients: Array<{ email: string; variables: Record<string, string> }>
  subject: string   // may contain {{var}} placeholders
  html: string      // may contain {{var}} placeholders
  campaignName: string
}): Promise<void> {
  if (opts.recipients.length === 0) return

  // Collect all {{var}} placeholders used in subject + html
  const usedVars = new Set<string>()
  const pattern = /\{\{(\w+)\}\}/g
  for (const text of [opts.subject, opts.html]) {
    let m: RegExpExecArray | null
    const re = new RegExp(pattern.source, 'g')
    while ((m = re.exec(text)) !== null) usedVars.add(m[1])
  }

  // 1. One list for this campaign send
  const listId = await createMoosendList(opts.campaignName)

  // 2. Create a custom field per variable (ignore duplicates / errors)
  const varList = Array.from(usedVars)
  for (const varName of varList) {
    await moosendFetch(`/lists/${listId}/customfields/create.json`, {
      method: 'POST',
      body: JSON.stringify({ Name: varName, CustomFieldType: 'Text', IsRequired: false }),
    }).catch(() => {})
  }

  // 3. Add all subscribers with their personalized variable values
  const subscribers = opts.recipients.map(r => ({
    Email: r.email,
    CustomFields: varList.map(v => `${v}=${r.variables[v] ?? ''}`),
  }))
  await addSubscribersToList(listId, subscribers)

  // 4. Wait until Moosend has finished importing the subscribers into the list.
  // Sending while the import is still processing leaves the campaign as Draft
  // with a "not sent successfully" notification.
  await waitForListCount(listId, opts.recipients.length)

  // 5. Convert {{var}} → [subscription.var] in subject + html
  const toMoosendTag = (s: string) => s.replace(/\{\{(\w+)\}\}/g, '[subscription.$1]')

  // 6. ONE campaign, ONE send
  await createAndSendCampaign({
    name: opts.campaignName,
    subject: toMoosendTag(opts.subject),
    senderEmail: SENDER_EMAIL,
    replyToEmail: REPLY_TO_EMAIL,
    htmlContent: toMoosendTag(opts.html),
    listId,
  })
}

// Polls the list until ActiveMemberCount >= expected (or timeout ~60s).
// Moosend processes subscribe_many asynchronously; sending a campaign before
// the list is populated makes the send fail silently (campaign stays Draft).
async function waitForListCount(listId: string, expected: number): Promise<void> {
  const MAX_ATTEMPTS = 20
  const DELAY_MS = 3000
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const result = await moosendFetch(`/lists/${listId}/details.json`)
      const ctx = (result as Record<string, any>).Context
      const count = Number(ctx?.ActiveMemberCount ?? 0)
      if (count >= expected) return
      console.log(`[Moosend] list ${listId}: ${count}/${expected} subscribers ready, waiting...`)
    } catch (err) {
      console.error('[Moosend] list details check failed:', err instanceof Error ? err.message : err)
    }
    await new Promise(res => setTimeout(res, DELAY_MS))
  }
  console.warn(`[Moosend] list ${listId} never reached ${expected} subscribers — sending anyway`)
}

export const GEMI_DISCLAIMER =
  "Τα στοιχεία επικοινωνίας σας αντλήθηκαν από το Γενικό Εμπορικό Μητρώο (ΓΕΜΗ) μέσω του επίσημου Open Data API του Ελληνικού Δημοσίου, υπό την άδεια ανοιχτών δεδομένων ODC-BY-1.0, η οποία επιτρέπει ρητά την εμπορική χρήση. Πρόκειται για δημόσια διαθέσιμα εταιρικά στοιχεία (gemi.gov.gr).";

export interface MoosendSubscriber {
  Email: string;
  Name?: string;
  CustomFields?: string[]; // ["field_name=value", ...]
}

export interface CampaignOptions {
  name: string;
  subject: string;
  senderEmail: string;
  replyToEmail: string;
  htmlContent: string;
  listId: string;
}

export interface CampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
}

function getApiKey(): string {
  if (!API_KEY) {
    throw new Error("MOOSEND_API_KEY environment variable is not set");
  }
  return API_KEY;
}

async function moosendFetch(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const apiKey = getApiKey();
  const url = `${BASE_URL}${path}${path.includes("?") ? "&" : "?"}apikey=${apiKey}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Moosend API error: ${response.status} ${response.statusText} — ${text}`
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `Moosend API returned non-JSON response (status ${response.status}): ${text}`
    );
  }

  const data = json as Record<string, unknown>;
  if (data.Code !== undefined && data.Code !== 0) {
    throw new Error(
      `Moosend API error (Code ${data.Code}): ${data.Error ?? JSON.stringify(json)}`
    );
  }

  return json;
}

export async function createMoosendList(name: string): Promise<string> {
  const result = await moosendFetch("/lists/create.json", {
    method: "POST",
    body: JSON.stringify({ Name: name }),
  });

  const data = result as Record<string, unknown>;
  const context = data.Context;

  if (!context || typeof context !== "string") {
    throw new Error(
      `Moosend createMoosendList: unexpected response shape — ${JSON.stringify(result)}`
    );
  }

  return context;
}

export async function addSubscribersToList(
  listId: string,
  subscribers: MoosendSubscriber[]
): Promise<void> {
  const BATCH_SIZE = 500;

  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE);

    await moosendFetch(`/subscribers/${listId}/subscribe_many.json`, {
      method: "POST",
      body: JSON.stringify({ Subscribers: batch }),
    });
  }
}

export async function createAndSendCampaign(
  opts: CampaignOptions
): Promise<string> {
  // Plain-text fallback derived from the HTML — some Moosend configurations
  // refuse to send campaigns that have no plain-text body.
  const plainContent = opts.htmlContent
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const createResult = await moosendFetch("/campaigns/create.json", {
    method: "POST",
    body: JSON.stringify({
      Name: opts.name,
      Subject: opts.subject,
      SenderEmail: opts.senderEmail,
      ReplyToEmail: opts.replyToEmail,
      HTMLContent: opts.htmlContent,
      PlainContent: plainContent,
      MailingLists: [{ MailingListID: opts.listId, SegmentID: null }],
      ConfirmationToEmail: opts.replyToEmail,
      Type: 'Regular',
    }),
  });

  const createData = createResult as Record<string, unknown>;
  const campaignId = createData.Context;

  if (!campaignId || typeof campaignId !== "string") {
    throw new Error(
      `Moosend createAndSendCampaign: unexpected create response — ${JSON.stringify(createResult)}`
    );
  }

  const sendResult = await moosendFetch(`/campaigns/${campaignId}/send.json`, {
    method: "POST",
  });
  console.log(`[Moosend] send.json response for campaign ${campaignId}:`, JSON.stringify(sendResult));

  return campaignId;
}

export async function getCampaignStats(
  campaignId: string
): Promise<CampaignStats> {
  const result = await moosendFetch(`/campaigns/${campaignId}/stats.json`);

  const data = result as Record<string, unknown>;
  const context = data.Context as Record<string, unknown> | undefined;

  if (!context) {
    throw new Error(
      `Moosend getCampaignStats: unexpected response shape — ${JSON.stringify(result)}`
    );
  }

  return {
    sent: Number(context.TotalSent ?? 0),
    delivered: Number(context.TotalDelivered ?? 0),
    opened: Number(context.UniqueOpens ?? 0),
    clicked: Number(context.UniqueClicks ?? 0),
    bounced: Number(context.TotalBounced ?? 0),
    unsubscribed: Number(context.TotalUnsubscribed ?? 0),
  };
}
