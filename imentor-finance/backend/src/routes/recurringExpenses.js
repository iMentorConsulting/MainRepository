const router = require('express').Router();
const RecurringExpense = require('../models/RecurringExpense');
const Expense = require('../models/Expense');

// List all recurring expenses
router.get('/', async (req, res) => {
  try {
    const rows = await RecurringExpense.findAll({ order: [['category', 'ASC'], ['supplier', 'ASC']] });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create recurring expense
router.post('/', async (req, res) => {
  try {
    const r = await RecurringExpense.create(req.body);
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update recurring expense
router.put('/:id', async (req, res) => {
  try {
    const r = await RecurringExpense.findByPk(req.params.id);
    if (!r) return res.status(404).json({ error: 'Δεν βρέθηκε' });
    await r.update(req.body);
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete all recurring expenses
router.delete('/all', async (req, res) => {
  try {
    const count = await RecurringExpense.destroy({ where: {}, truncate: false });
    res.json({ deleted: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete single recurring expense
router.delete('/:id', async (req, res) => {
  try {
    await RecurringExpense.destroy({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk CSV import: expects { rows: [{amount,category,service_type,supplier,description,vat_amount,payment_method,notes,day_of_month}] }
router.post('/import-csv', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Δεν υπάρχουν δεδομένα' });
    const created = [];
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const amount = parseFloat(row.amount);
      if (!amount || isNaN(amount)) { errors.push(`Σειρά ${i + 2}: μη έγκυρο ποσό "${row.amount}"`); continue; }
      try {
        const r = await RecurringExpense.create({
          amount,
          category: row.category || null,
          service_type: row.service_type || null,
          supplier: row.supplier || null,
          description: row.description || null,
          vat_amount: row.vat_amount ? parseFloat(row.vat_amount) : null,
          payment_method: row.payment_method || null,
          notes: row.notes || null,
          day_of_month: row.day_of_month ? parseInt(row.day_of_month) : 1,
          is_active: true,
        });
        created.push(r.id);
      } catch (e) { errors.push(`Σειρά ${i + 2}: ${e.message}`); }
    }
    res.json({ created: created.length, errors });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Manual trigger: generate this month's recurring expenses
router.post('/generate', async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const recurring = await RecurringExpense.findAll({ where: { is_active: true } });
    const generated = [];
    const skipped = [];

    for (const r of recurring) {
      if (r.last_generated_month === currentMonth) {
        skipped.push(r.id);
        continue;
      }
      // Create the actual expense
      const day = Math.min(r.day_of_month || 1, 28);
      const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`;
      const expense = await Expense.create({
        date: dateStr,
        amount: r.amount,
        category: r.category,
        service_type: r.service_type,
        supplier: r.supplier,
        description: r.description || `[Επαναλαμβανόμενο] ${r.supplier || r.category || ''}`,
        vat_amount: r.vat_amount,
        payment_method: r.payment_method,
        notes: r.notes,
        source_sheet: 'RECURRING',
      });
      await r.update({ last_generated_month: currentMonth });
      generated.push(expense.id);
    }

    res.json({ generated: generated.length, skipped: skipped.length, month: currentMonth });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
