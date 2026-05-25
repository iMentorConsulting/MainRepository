require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sequelize = require('./config/db');

require('./models/Income');
require('./models/Expense');
require('./models/ListItem');
require('./models/CommissionLog');
require('./models/Customer');
require('./models/ServiceAgreement');
require('./models/RecurringExpense');

const authMiddleware = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/income',     authMiddleware, require('./routes/income'));
app.use('/api/expenses',   authMiddleware, require('./routes/expenses'));
app.use('/api/lists',      authMiddleware, require('./routes/listItems'));
app.use('/api/invoices',   authMiddleware, require('./routes/invoices'));
app.use('/api/emails',     authMiddleware, require('./routes/emails'));
app.use('/api/reports',    authMiddleware, require('./routes/reports'));
app.use('/api/import',     authMiddleware, require('./routes/importData'));
app.use('/api/customers',          authMiddleware, require('./routes/customers'));
app.use('/api/service-agreements', authMiddleware, require('./routes/serviceAgreements'));
app.use('/api/recurring-expenses', authMiddleware, require('./routes/recurringExpenses'));

app.get('/health', (_, res) => res.json({ ok: true }));

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../public')));
  app.get('*', (_, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
}

const PORT = process.env.PORT || 3001;

sequelize.sync({ alter: true }).then(async () => {
  console.log('Database connected & synced');
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}).catch(err => {
  console.error('DB sync error:', err.message);
  process.exit(1);
});
