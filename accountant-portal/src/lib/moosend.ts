const API_KEY = process.env.MOOSEND_API_KEY;
const BASE_URL = "https://api.moosend.com/v3";
const SENDER_EMAIL = process.env.MOOSEND_SENDER_EMAIL ?? 'info@i-mentor.gr'
const REPLY_TO_EMAIL = process.env.MOOSEND_REPLY_TO_EMAIL ?? 'info@i-mentor.gr'

// Send ONE Moosend campaign for all recipients using custom-field merge tags.
// This creates exactly 1 Moosend list + 1 Moosend campaign per GEMI campaign,
// regardless of recipient count. Personalization is done via #recipient:var# tags.
export async function sendMoosendBulkPersonalized(opts: {
  recipients: Array<{ email: string; variables: Record<string, string> }>
  subject: string   // may contain {{var}} placeholders
  html: string      // may contain {{var}} placeholders
  previewText?: string // may contain {{var}} placeholders
  campaignName: string
}): Promise<{ moosendCampaignId: string; moosendListId: string } | null> {
  if (opts.recipients.length === 0) return null

  // Moosend custom field values are hard-capped at 365 characters
  const MAX_FIELD_LEN = 365

  // Collect all {{var}} placeholders used in subject + preview + html
  const usedVars = new Set<string>()
  for (const text of [opts.subject, opts.previewText ?? '', opts.html]) {
    const re = /\{\{(\w+)\}\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) usedVars.add(m[1])
  }

  // Split variables: those whose value is IDENTICAL for every recipient
  // (e.g. program_description — often longer than the 365-char custom field
  // limit) are substituted directly into the content; only per-recipient
  // variables become Moosend custom fields.
  const commonVars: Record<string, string> = {}
  const perRecipientVars: string[] = []
  for (const varName of Array.from(usedVars)) {
    const firstVal = opts.recipients[0].variables[varName] ?? ''
    const identical = opts.recipients.every(r => (r.variables[varName] ?? '') === firstVal)
    if (identical) commonVars[varName] = firstVal
    else perRecipientVars.push(varName)
  }

  const substituteCommon = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (full, key) => (key in commonVars ? commonVars[key] : full))

  const subjectResolved = substituteCommon(opts.subject)
  const previewResolved = opts.previewText ? substituteCommon(opts.previewText) : undefined
  const htmlResolved = substituteCommon(opts.html)

  console.log(`[Moosend] variables: ${Object.keys(commonVars).length} common (inlined), ${perRecipientVars.length} per-recipient (custom fields): ${perRecipientVars.join(', ')}`)

  // 1. One list for this campaign send
  const listId = await createMoosendList(opts.campaignName)

  // 2. Create a custom field per per-recipient variable — failures here are
  // fatal, because a campaign whose #recipient:x# tags reference
  // non-existent fields will fail to send and stay in Draft.
  for (const varName of perRecipientVars) {
    try {
      await moosendFetch(`/lists/${listId}/customfields/create.json`, {
        method: 'POST',
        body: JSON.stringify({ Name: varName, CustomFieldType: 'Text', IsRequired: false }),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Moosend custom field '${varName}' creation failed: ${msg}`)
    }
  }

  // 3. Add all subscribers with their personalized variable values,
  // truncated to Moosend's 365-char custom field limit.
  const truncate = (v: string) => (v.length > MAX_FIELD_LEN ? v.slice(0, MAX_FIELD_LEN - 1) + '…' : v)
  const subscribers = opts.recipients.map(r => ({
    Email: r.email,
    CustomFields: perRecipientVars.map(v => `${v}=${truncate(r.variables[v] ?? '')}`),
  }))
  const addedCount = await addSubscribersToList(listId, subscribers)
  if (addedCount === 0) {
    throw new Error(
      `Moosend: 0/${opts.recipients.length} subscribers could be added to list ${listId} — ` +
      `check Railway logs for the subscribe_many/subscribe.json responses. Aborting send.`
    )
  }
  console.log(`[Moosend] list ${listId}: ${addedCount}/${opts.recipients.length} subscribers confirmed added`)

  // Short grace period for Moosend to index the new subscribers before sending
  await new Promise(res => setTimeout(res, 5000))

  // 5. Convert remaining per-recipient {{var}} → #recipient:var# (Moosend
  // personalization tag syntax for custom fields)
  const toMoosendTag = (s: string) => s.replace(/\{\{(\w+)\}\}/g, '#recipient:$1#')

  // 6. ONE campaign, ONE send
  const moosendCampaignId = await createAndSendCampaign({
    name: opts.campaignName,
    subject: toMoosendTag(subjectResolved),
    previewText: previewResolved ? toMoosendTag(previewResolved) : undefined,
    senderEmail: SENDER_EMAIL,
    replyToEmail: REPLY_TO_EMAIL,
    htmlContent: toMoosendTag(htmlResolved),
    listId,
  })
  return { moosendCampaignId, moosendListId: listId }
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
  previewText?: string;
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
): Promise<number> {
  const BATCH_SIZE = 500;

  let totalAdded = 0;

  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE);

    const result = await moosendFetch(`/subscribers/${listId}/subscribe_many.json`, {
      method: "POST",
      body: JSON.stringify({ Subscribers: batch }),
    });
    const added = (result as Record<string, any>).Context
    const addedCount = Array.isArray(added) ? added.length : 0
    totalAdded += addedCount
    console.log(`[Moosend] subscribe_many list ${listId}: sent ${batch.length}, added ${addedCount}. Response: ${JSON.stringify(result).slice(0, 1500)}`)

    // Bulk import silently added fewer than expected — retry the whole batch
    // one-by-one via subscribe.json, which reports errors per subscriber.
    if (addedCount < batch.length) {
      console.warn(`[Moosend] subscribe_many under-added (${addedCount}/${batch.length}) — falling back to individual subscribes`)
      for (const sub of batch) {
        try {
          const single = await moosendFetch(`/subscribers/${listId}/subscribe.json`, {
            method: "POST",
            body: JSON.stringify(sub),
          });
          const sctx = (single as Record<string, any>).Context
          if (sctx?.ID) totalAdded++
          else console.warn(`[Moosend] subscribe.json for ${sub.Email}: unexpected response ${JSON.stringify(single).slice(0, 500)}`)
        } catch (err) {
          console.error(`[Moosend] subscribe.json failed for ${sub.Email}:`, err instanceof Error ? err.message : err)
        }
      }
    }
  }

  return totalAdded;
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
      ...(opts.previewText ? { PreviewText: opts.previewText } : {}),
      SenderEmail: opts.senderEmail,
      ReplyToEmail: opts.replyToEmail,
      HTMLContent: opts.htmlContent,
      PlainContent: plainContent,
      MailingLists: [{ MailingListID: opts.listId, SegmentID: null }],
      ConfirmationToEmail: opts.replyToEmail,
      Type: 'Regular',
      TrackInGoogleAnalytics: true,
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

  // Verify the campaign actually left Draft state. Moosend's send.json can
  // return success while the campaign silently stays in Draft (e.g. failed
  // personalization tags, empty list). Surface that as an error instead of
  // reporting a phantom success.
  await new Promise(res => setTimeout(res, 5000));
  try {
    const view = await moosendFetch(`/campaigns/${campaignId}/view.json`);
    const ctx = (view as Record<string, any>).Context;
    const status = ctx?.Status;
    console.log(`[Moosend] campaign ${campaignId} status after send: ${JSON.stringify(status)}`);
    // Status 0 = Draft in Moosend's enum; also guard against the string form
    if (status === 0 || status === 'Draft') {
      throw new Error(
        `Moosend campaign '${opts.name}' (${campaignId}) is still in Draft after send — ` +
        `the send was rejected by Moosend. Check the campaign in the Moosend dashboard for the reason.`
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('still in Draft')) throw err;
    // view.json itself failed — log but don't fail the send on a status-check error
    console.error('[Moosend] post-send status check failed:', err instanceof Error ? err.message : err);
  }

  return campaignId;
}

export async function getCampaignStats(
  campaignId: string
): Promise<CampaignStats> {
  // Moosend's campaign summary endpoint (recipients/opens/clicks/bounces)
  const result = await moosendFetch(`/campaigns/${campaignId}/view_summary.json`);

  const data = result as Record<string, unknown>;
  const context = data.Context as Record<string, any> | undefined;

  if (!context) {
    throw new Error(
      `Moosend getCampaignStats: unexpected response shape — ${JSON.stringify(result)}`
    );
  }

  console.log(`[Moosend] view_summary for ${campaignId}:`, JSON.stringify(context).slice(0, 1000));

  const num = (...candidates: unknown[]) => {
    for (const c of candidates) {
      const n = Number(c);
      if (!Number.isNaN(n) && c != null) return n;
    }
    return 0;
  };

  return {
    sent: num(context.TotalSent, context.RecipientsCount, context.TotalRecipients),
    delivered: num(context.TotalDelivered, context.TotalSent),
    opened: num(context.UniqueOpens, context.TotalOpens, context.Opens),
    clicked: num(context.UniqueLinkClicks, context.UniqueClicks, context.TotalLinkClicks, context.Clicks),
    bounced: num(context.TotalBounces, context.TotalBounced, context.Bounces),
    unsubscribed: num(context.TotalUnsubscribes, context.TotalUnsubscribed, context.Unsubscribes),
  };
}
