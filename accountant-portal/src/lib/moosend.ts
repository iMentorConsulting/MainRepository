import nodemailer from 'nodemailer'

const API_KEY = process.env.MOOSEND_API_KEY;
const BASE_URL = "https://api.moosend.com/v3";
const SENDER_EMAIL = process.env.MOOSEND_SENDER_EMAIL ?? 'info@i-mentor.gr'
const REPLY_TO_EMAIL = process.env.MOOSEND_REPLY_TO_EMAIL ?? 'info@i-mentor.gr'

// Nodemailer transporter using Moosend SMTP relay.
// Host: smtp.moosend.com  Port: 587  User: sender email  Pass: API key
function getMoosendTransporter() {
  const apiKey = API_KEY
  if (!apiKey) throw new Error('MOOSEND_API_KEY is not set')
  return nodemailer.createTransport({
    host: 'smtp.moosend.com',
    port: 587,
    secure: false,
    auth: { user: SENDER_EMAIL, pass: apiKey },
    family: 4,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  } as any)
}

export async function sendMoosendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  const transporter = getMoosendTransporter()
  await transporter.sendMail({
    from: `iMentor Consulting <${SENDER_EMAIL}>`,
    replyTo: REPLY_TO_EMAIL,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  })
}

export const GEMI_DISCLAIMER =
  "Τα στοιχεία επικοινωνίας σας αντλήθηκαν από το Γενικό Εμπορικό Μητρώο (ΓΕΜΗ) μέσω του επίσημου Open Data API του Ελληνικού Δημοσίου, υπό την άδεια ανοιχτών δεδομένων ODC-BY-1.0, η οποία επιτρέπει ρητά την εμπορική χρήση. Πρόκειται για δημόσια διαθέσιμα εταιρικά στοιχεία (gemi.gov.gr).";

export interface MoosendSubscriber {
  Email: string;
  Name?: string;
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
  const createResult = await moosendFetch("/campaigns/create.json", {
    method: "POST",
    body: JSON.stringify({
      Name: opts.name,
      Subject: opts.subject,
      SenderEmail: opts.senderEmail,
      ReplyToEmail: opts.replyToEmail,
      HTMLContent: opts.htmlContent,
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

  await moosendFetch(`/campaigns/${campaignId}/send.json`, {
    method: "POST",
  });

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
