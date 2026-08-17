const CHATWOOT_URL = process.env.CHATWOOT_URL ?? 'https://chat.i-mentor.gr';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN ?? '';
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? '1';
const CHATWOOT_INBOX_ID = process.env.CHATWOOT_INBOX_ID ?? '1';

function baseUrl(): string {
  return `${CHATWOOT_URL}/api/v1/accounts/${CHATWOOT_ACCOUNT_ID}`;
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'api_access_token': CHATWOOT_API_TOKEN,
  };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Chatwoot API error ${response.status} ${response.statusText} for ${url}: ${body}`,
    );
  }

  return response.json() as Promise<T>;
}

function toE164Greek(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('30') && digits.length === 12) return `+${digits}`
  if (digits.length === 10 && digits.startsWith('6')) return `+30${digits}`
  if (digits.length === 10 && digits.startsWith('2')) return `+30${digits}`
  return `+${digits}`
}

export async function createOrFindContact(phone: string, name?: string): Promise<number> {
  const normalized = toE164Greek(phone)
  const searchUrl = `${baseUrl()}/contacts/search?q=${encodeURIComponent(normalized)}`;

  const searchResult = await apiFetch<{ payload: Array<{ id: number; phone_number?: string }> }>(
    searchUrl,
  );

  const existing = searchResult.payload?.find(
    (c) => c.phone_number === normalized,
  );

  if (existing) {
    return existing.id;
  }

  const created = await apiFetch<{ id: number }>(`${baseUrl()}/contacts`, {
    method: 'POST',
    body: JSON.stringify({
      name: name ?? normalized,
      phone_number: normalized,
    }),
  });

  return created.id;
}

export async function sendViberMessage(
  phone: string,
  message: string,
  name?: string,
): Promise<{ contactId: number; conversationId: number }> {
  const contactId = await createOrFindContact(toE164Greek(phone), name);

  const conversation = await apiFetch<{ id: number }>(
    `${baseUrl()}/conversations`,
    {
      method: 'POST',
      body: JSON.stringify({
        inbox_id: Number(CHATWOOT_INBOX_ID),
        contact_id: contactId,
      }),
    },
  );

  const conversationId = conversation.id;

  await apiFetch(`${baseUrl()}/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: message,
      message_type: 'outgoing',
      private: false,
    }),
  });

  return { contactId, conversationId };
}

export async function getConversationStatus(
  conversationId: number,
): Promise<{ status: string; read: boolean }> {
  const conversation = await apiFetch<{
    status: string;
    meta?: { all_count?: number; read_count?: number };
  }>(`${baseUrl()}/conversations/${conversationId}`);

  const allCount = conversation.meta?.all_count ?? 0;
  const readCount = conversation.meta?.read_count ?? 0;

  return {
    status: conversation.status,
    read: allCount === readCount,
  };
}
