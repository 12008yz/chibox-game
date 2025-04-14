const { Model, DataTypes, Sequelize } = require('sequelize');
const sequelize = new Sequelize('chibox-game', 'postgres', '123', { // Замените на ваш пароль
  host: '127.0.0.1',
  dialect: 'postgres',
});

class User extends Model {}

User.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  sequelize,
  modelName: 'User',
  tableName: 'users',
  timestamps: true,
});

module.exports = User;
