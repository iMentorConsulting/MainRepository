const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Expense = sequelize.define('Expense', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  date:             { type: DataTypes.DATEONLY },
  amount:           { type: DataTypes.DECIMAL(12,2) },
  category:         { type: DataTypes.STRING },
  service_type:     { type: DataTypes.STRING },
  supplier:         { type: DataTypes.STRING },
  related_service:  { type: DataTypes.STRING },
  description:      { type: DataTypes.TEXT },
  vat_amount:       { type: DataTypes.DECIMAL(12,2) },
  payment_method:   { type: DataTypes.STRING },
  notes:            { type: DataTypes.TEXT },
  source_sheet:     { type: DataTypes.STRING, defaultValue: 'ΕΞΟΔΑ' }
}, {
  tableName: 'expenses',
  timestamps: true
});

module.exports = Expense;
