module.exports = (sequelize, DataTypes) => {
   const TowerDefenseGame = sequelize.define('TowerDefenseGame', {
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
     waves_completed: {
       type: DataTypes.INTEGER,
       defaultValue: 0,
       allowNull: false
     },
     total_waves: {
       type: DataTypes.INTEGER,
       defaultValue: 10,
       allowNull: false
     },
     enemies_killed: {
       type: DataTypes.INTEGER,
       defaultValue: 0,
       allowNull: false
     },
     towers_built: {
       type: DataTypes.INTEGER,
       defaultValue: 0,
       allowNull: false
     },
     score: {
       type: DataTypes.INTEGER,
       defaultValue: 0,
       allowNull: false
     },
     result: {
       type: DataTypes.ENUM('win', 'lose', 'in_progress'),
       defaultValue: 'in_progress',
       allowNull: false
     },
     reward_amount: {
       type: DataTypes.DECIMAL(10, 2),
       defaultValue: 0,
       allowNull: true
     },
     game_data: {
       type: DataTypes.JSONB,
       allowNull: true
     },
     completed_at: {
       type: DataTypes.DATE,
       allowNull: true
     }
   }, {
     tableName: 'tower_defense_games',
     underscored: true,
     timestamps: true,
     createdAt: 'created_at',
     updatedAt: 'updated_at'
   });
   
     return TowerDefenseGame;
   };
   