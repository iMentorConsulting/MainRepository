# 🏨 Σύστημα Διαχείρισης Κρατήσεων

Σύστημα διαχείρισης κρατήσεων για τουριστικά καταλύματα με AI-powered έξυπνες συστάσεις.

## Χαρακτηριστικά

- **Πολλαπλές μονάδες** διαφορετικού τύπου (διαμέρισμα, δωμάτιο, βίλα, κ.λπ.)
- **Πολλαπλά κανάλια** κρατήσεων: Booking.com, Airbnb, Απευθείας, Άλλο
- **Διαχείριση πελατών** με πλήρη στοιχεία
- **Οπτικό ημερολόγιο** κρατήσεων (Gantt-style, ανά μήνα)
- **Αναφορές & Στατιστικά**: πληρότητα, οικονομικά, ανά κανάλι
- **AI Σύμβουλος** (Claude API):
  - Βέλτιστη τοποθέτηση νέας κράτησης
  - Ειδοποιήσεις μικρών κενών (1-3 ημερών)

## Εγκατάσταση & Εκκίνηση

### Προαπαιτούμενα
- Python 3.10+
- Node.js 18+
- Anthropic API Key

### Βήματα

1. **Αντιγράψτε το αρχείο περιβάλλοντος:**
   ```bash
   cp backend/.env.example backend/.env
   # Συμπληρώστε το ANTHROPIC_API_KEY στο backend/.env
   ```

2. **Εκκίνηση (αυτόματα):**
   ```bash
   chmod +x start.sh
   ./start.sh
   ```

3. **Ή χειροκίνητα:**
   ```bash
   # Backend
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000

   # Frontend (νέο terminal)
   cd frontend
   npm install
   npm run dev
   ```

4. Ανοίξτε: http://localhost:5173

## Τεχνολογίες

| Επίπεδο | Τεχνολογία |
|---------|------------|
| Backend | FastAPI, SQLAlchemy, SQLite |
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| AI | Anthropic Claude API |

## API Docs

Διαθέσιμα στο http://localhost:8000/docs (Swagger UI)
