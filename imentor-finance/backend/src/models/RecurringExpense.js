const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const RecurringExpense = sequelize.define('RecurringExpense', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  amount:      { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  category:    { type: DataTypes.STRING },
  supplier:    { type: DataTypes.STRING },
  description: { type: DataTypes.STRING },
  vat_amount:  { type: DataTypes.DECIMAL(12, 2) },
  payment_method: { type: DataTypes.STRING },
  notes:       { type: DataTypes.TEXT },
  is_active:   { type: DataTypes.BOOLEAN, defaultValue: true },
  day_of_month: { type: DataTypes.INTEGER, defaultValue: 1 }, // which day to create on (1-28)
  last_generated_month: { type: DataTypes.STRING }, // 'YYYY-MM' of last auto-generation
}, { tableName: 'recurring_expenses', timestamps: true });

module.exports = RecurringExpense;
