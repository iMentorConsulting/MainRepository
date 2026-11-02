const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// One row per bank movement. amount > 0 = πίστωση (credit/deposit), amount < 0 = χρέωση (debit).
const BankTransaction = sequelize.define('BankTransaction', {
  id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  bank:           { type: DataTypes.STRING, allowNull: false },          // alpha | piraeus | eurobank
  account:        { type: DataTypes.STRING, defaultValue: '' },
  tx_date:        { type: DataTypes.DATEONLY, allowNull: false },
  amount:         { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  currency:       { type: DataTypes.STRING(3), defaultValue: 'EUR' },
  description:    { type: DataTypes.TEXT, defaultValue: '' },
  counterparty:   { type: DataTypes.STRING, defaultValue: '' },
  direction:      { type: DataTypes.STRING(6), allowNull: false },       // credit | debit
  fingerprint:    { type: DataTypes.STRING(64), allowNull: false, unique: true },
  category:       { type: DataTypes.STRING, defaultValue: '' },
  note:           { type: DataTypes.TEXT, defaultValue: '' },
  invoice_issued: { type: DataTypes.BOOLEAN, allowNull: true },          // null = not marked yet
  income_id:      { type: DataTypes.INTEGER, allowNull: true },          // reserved for matching to Income / myDATA
  seen:           { type: DataTypes.BOOLEAN, defaultValue: false },
  notified:       { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
  tableName: 'bank_transactions',
  timestamps: true,
  indexes: [{ fields: ['tx_date'] }, { fields: ['direction'] }],
});

module.exports = BankTransaction;
