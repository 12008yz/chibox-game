const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TicTacToeGame = sequelize.define('TicTacToeGame', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    game_state: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        board: [null, null, null, null, null, null, null, null, null],
        currentPlayer: 'player', // 'player' или 'bot'
        winner: null, // 'player', 'bot', 'draw', null
        status: 'playing' // 'playing', 'finished'
      }
    },
    attempts_left: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3
    },
    bot_goes_first: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    result: {
      type: DataTypes.ENUM('win', 'lose', 'draw', 'ongoing'),
      allowNull: false,
      defaultValue: 'ongoing'
    },
    reward_given: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    tableName: 'tic_tac_toe_games',
    underscored: true,
    timestamps: true
  });

  TicTacToeGame.associate = (models) => {
    TicTacToeGame.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  };

  return TicTacToeGame;
};
