const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ListItem = sequelize.define('ListItem', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  list_type: {
    type: DataTypes.STRING
  },
  value:     { type: DataTypes.STRING, allowNull: false },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  tableName: 'list_items',
  timestamps: true
});

module.exports = ListItem;
