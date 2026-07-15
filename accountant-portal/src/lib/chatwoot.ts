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
    Authorization: `Bearer ${CHATWOOT_API_TOKEN}`,
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

export async function createOrFindContact(phone: string, name?: string): Promise<number> {
  const searchUrl = `${baseUrl()}/contacts/search?q=${encodeURIComponent(phone)}`;

  const searchResult = await apiFetch<{ payload: Array<{ id: number; phone_number?: string }> }>(
    searchUrl,
  );

  const existing = searchResult.payload?.find(
    (c) => c.phone_number === phone,
  );

  if (existing) {
    return existing.id;
  }

  const created = await apiFetch<{ id: number }>(`${baseUrl()}/contacts`, {
    method: 'POST',
    body: JSON.stringify({
      name: name ?? phone,
      phone_number: phone,
    }),
  });

  return created.id;
}

export async function sendViberMessage(
  phone: string,
  message: string,
  name?: string,
): Promise<{ contactId: number; conversationId: number }> {
  const contactId = await createOrFindContact(phone, name);

  const conversation = await apiFetch<{ id: number }>(
    `${baseUrl()}/contacts/${contactId}/conversations`,
    {
      method: 'POST',
      body: JSON.stringify({
        inbox_id: Number(CHATWOOT_INBOX_ID),
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
