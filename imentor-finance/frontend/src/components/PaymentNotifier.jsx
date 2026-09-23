import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

export default function PaymentNotifier() {
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;

    const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);

    es.addEventListener('new_payment', (e) => {
      const { customer_name, invoice_type, amount_collected } = JSON.parse(e.data);

      const invoiceColor =
        invoice_type === 'ΤΙΜΟΛΟΓΙΟ' ? '#6366f1' :
        invoice_type === 'ΑΠΟΔΕΙΞΗ'  ? '#10b981' : '#94a3b8';

      toast.custom(
        (t) => (
          <div
            style={{
              opacity: t.visible ? 1 : 0,
              transition: 'opacity 0.3s',
              background: 'linear-gradient(135deg, #0f0f1a, #13131f)',
              border: '1px solid rgba(99,102,241,0.4)',
              borderRadius: '16px',
              padding: '16px 18px',
              minWidth: '280px',
              maxWidth: '340px',
              boxShadow: '0 8px 32px rgba(99,102,241,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}>
                💰
              </div>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 2 }}>
                  ΝΕΑ ΠΛΗΡΩΜΗ
                </p>
                <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                  {customer_name}
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#a5b4fc', fontSize: 13, fontWeight: 600 }}>
                    {Number(amount_collected).toLocaleString('el-GR')}€
                  </span>
                  <span style={{
                    background: invoiceColor,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 6,
                    letterSpacing: '0.03em',
                  }}>
                    {invoice_type}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => toast.dismiss(t.id)}
              style={{
                alignSelf: 'stretch',
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '8px 0',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.04em',
              }}
            >
              OK
            </button>
          </div>
        ),
        { duration: Infinity }
      );
    });

    es.onerror = () => {};

    return () => es.close();
  }, [token]);

  return null;
}
