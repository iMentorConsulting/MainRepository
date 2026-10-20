const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const AppSetting = sequelize.define('AppSetting', {
  key:   { type: DataTypes.STRING, primaryKey: true },
  value: { type: DataTypes.TEXT },
}, { tableName: 'app_settings', timestamps: false });

module.exports = AppSetting;
