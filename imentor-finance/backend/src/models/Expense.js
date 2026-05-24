const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Expense = sequelize.define('Expense', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  date:             { type: DataTypes.DATEONLY },
  amount:           { type: DataTypes.DECIMAL(12,2) },
  category:         { type: DataTypes.STRING },
  supplier:         { type: DataTypes.STRING },
  related_service:  { type: DataTypes.STRING },
  description:      { type: DataTypes.TEXT },
  source_sheet:     { type: DataTypes.STRING, defaultValue: 'ΕΞΟΔΑ' }
}, {
  tableName: 'expenses',
  timestamps: true
});

module.exports = Expense;
