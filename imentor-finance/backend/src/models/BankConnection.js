const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// One row per (provider, bank): the consent the user gave to read that bank's accounts.
// Consents expire (NBG aggregator: 180 days) and must be renewed through the bank's own login.
const BankConnection = sequelize.define('BankConnection', {
  id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  provider:           { type: DataTypes.STRING(20), allowNull: false },   // nbg | mock
  bank:               { type: DataTypes.STRING(20), allowNull: false },   // nbg | alpha | piraeus | eurobank
  status:             { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'pending' }, // pending | active | expired | error
  consent_id:         { type: DataTypes.STRING },
  consent_expires_at: { type: DataTypes.DATE },
  last_sync_at:       { type: DataTypes.DATE },
  last_error:         { type: DataTypes.TEXT, defaultValue: '' },
  expiry_alerted_on:  { type: DataTypes.DATEONLY },                       // so the renewal Viber alert goes out once a day
}, {
  tableName: 'bank_connections',
  timestamps: true,
  indexes: [{ unique: true, fields: ['provider', 'bank'] }],
});

module.exports = BankConnection;
