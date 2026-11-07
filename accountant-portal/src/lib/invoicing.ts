// Pluggable invoicing system adapter
// Replace the implementation when API docs are available

export interface InvoiceData {
  commissionId: string
  accountantId: string
  accountantName: string
  accountantEmail: string
  businessName: string
  serviceName: string
  stage: string
  amount: number // in cents
  currency: string
  description: string
  date: Date
}

export interface InvoiceResult {
  externalId: string
  invoiceNumber: string
  invoiceUrl?: string
  status: string
}

export interface InvoicingAdapter {
  createInvoice(data: InvoiceData): Promise<InvoiceResult>
  getInvoice(externalId: string): Promise<InvoiceResult | null>
  listInvoices(accountantId: string, from?: Date, to?: Date): Promise<InvoiceResult[]>
}

// Mock adapter - replace with real implementation when API docs available
class MockInvoicingAdapter implements InvoicingAdapter {
  async createInvoice(data: InvoiceData): Promise<InvoiceResult> {
    console.log('[INVOICING MOCK] Creating invoice:', data)
    // Simulate API call
    await new Promise(r => setTimeout(r, 100))
    const invoiceNumber = `INV-${Date.now()}`
    return {
      externalId: `mock-${invoiceNumber}`,
      invoiceNumber,
      invoiceUrl: undefined,
      status: 'created',
    }
  }

  async getInvoice(_externalId: string): Promise<InvoiceResult | null> {
    return null
  }

  async listInvoices(_accountantId: string): Promise<InvoiceResult[]> {
    return []
  }
}

// Export the active adapter
// TODO: Replace MockInvoicingAdapter with real implementation
export const invoicingAdapter: InvoicingAdapter = new MockInvoicingAdapter()

// Helper to sync commission to invoicing system
export async function syncCommissionToInvoicing(commissionId: string): Promise<InvoiceResult | null> {
  try {
    const { prisma } = await import('./prisma')
    const commission = await prisma.commission.findUnique({
      where: { id: commissionId },
      include: {
        accountant: true,
        business: true,
        paymentRequest: { include: { service: true } },
      },
    })
    if (!commission) return null
    if (commission.externalInvoiceId) return null // already synced

    const result = await invoicingAdapter.createInvoice({
      commissionId,
      accountantId: commission.accountantId,
      accountantName: commission.accountant.contactPerson,
      accountantEmail: commission.accountant.email,
      businessName: commission.business.onomasia || commission.business.afm,
      serviceName: commission.paymentRequest?.service?.name || 'Υπηρεσία',
      stage: commission.stage === 'APPLICATION' ? 'Αμοιβή Αίτησης' : 'Αμοιβή Υλοποίησης',
      amount: commission.commissionAmount,
      currency: 'EUR',
      description: `Προμήθεια ${commission.stage === 'APPLICATION' ? 'αίτησης' : 'υλοποίησης'} - ${commission.business.onomasia || commission.business.afm}`,
      date: new Date(),
    })

    await prisma.commission.update({
      where: { id: commissionId },
      data: {
        externalInvoiceId: result.externalId,
        externalInvoiceNo: result.invoiceNumber,
        externalInvoiceUrl: result.invoiceUrl,
        externalSyncedAt: new Date(),
      },
    })

    return result
  } catch (error) {
    console.error('[INVOICING] Sync failed:', error)
    return null
  }
}
