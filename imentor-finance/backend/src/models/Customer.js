const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Customer = sequelize.define('Customer', {
  id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:              { type: DataTypes.STRING, allowNull: false },
  vat_number:        { type: DataTypes.STRING },
  email:             { type: DataTypes.STRING },
  phone:             { type: DataTypes.STRING },
  city:              { type: DataTypes.STRING },
  postal_code:       { type: DataTypes.STRING },
  address:           { type: DataTypes.STRING },
  business_activity: { type: DataTypes.STRING },
  accountant:        { type: DataTypes.STRING },
  accountant_email:  { type: DataTypes.STRING },
  notes:             { type: DataTypes.TEXT },
  taxisnet_username: { type: DataTypes.STRING },
  taxisnet_password: { type: DataTypes.STRING },
}, {
  tableName: 'customers',
  timestamps: true
});

module.exports = Customer;
