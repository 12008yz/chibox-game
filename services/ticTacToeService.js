class TicTacToeService {
   constructor() {
     this.PLAYER = 'X';
     this.BOT = 'O';
     this.EMPTY = null;
   }
 
   // Проверяем, есть ли победитель
   checkWinner(board) {
     const winPatterns = [
       [0, 1, 2], [3, 4, 5], [6, 7, 8], // Горизонтальные
       [0, 3, 6], [1, 4, 7], [2, 5, 8], // Вертикальные
       [0, 4, 8], [2, 4, 6]             // Диагональные
     ];
 
     for (const pattern of winPatterns) {
       const [a, b, c] = pattern;
       if (board[a] && board[a] === board[b] && board[a] === board[c]) {
         return board[a];
       }
     }
 
     // Проверяем на ничью
     if (board.every(cell => cell !== null)) {
       return 'DRAW';
     }
 
     return null;
   }
 
   // Получаем доступные ходы
   getAvailableMoves(board) {
     return board.map((cell, index) => cell === null ? index : null).filter(index => index !== null);
   }
 
   // Создаем копию доски
   cloneBoard(board) {
     return [...board];
   }
 
   // Minimax алгоритм с альфа-бета отсечением
   minimax(board, depth, isMaximizing, alpha = -Infinity, beta = Infinity) {
     const winner = this.checkWinner(board);
 
     // Терминальные состояния
     if (winner === this.BOT) return 10 - depth;
     if (winner === this.PLAYER) return depth - 10;
     if (winner === 'DRAW') return 0;
 
     if (isMaximizing) {
       let maxEval = -Infinity;
 
       for (const move of this.getAvailableMoves(board)) {
         const newBoard = this.cloneBoard(board);
         newBoard[move] = this.BOT;
 
         const eval_score = this.minimax(newBoard, depth + 1, false, alpha, beta);
         maxEval = Math.max(maxEval, eval_score);
         alpha = Math.max(alpha, eval_score);
 
         if (beta <= alpha) break; // Альфа-бета отсечение
       }
 
       return maxEval;
     } else {
       let minEval = Infinity;
 
       for (const move of this.getAvailableMoves(board)) {
         const newBoard = this.cloneBoard(board);
         newBoard[move] = this.PLAYER;
 
         const eval_score = this.minimax(newBoard, depth + 1, true, alpha, beta);
         minEval = Math.min(minEval, eval_score);
         beta = Math.min(beta, eval_score);
 
         if (beta <= alpha) break; // Альфа-бета отсечение
       }
 
       return minEval;
     }
   }
 
   // Получаем лучший ход для бота
   getBestMove(board, difficulty = 1.0) {
     const availableMoves = this.getAvailableMoves(board);
 
     if (availableMoves.length === 0) {
       return null;
     }
 
     // Если сложность не максимальная, иногда делаем случайный ход
     if (Math.random() > difficulty) {
       return availableMoves[Math.floor(Math.random() * availableMoves.length)];
     }
 
     let bestMove = availableMoves[0];
     let bestValue = -Infinity;
 
     for (const move of availableMoves) {
       const newBoard = this.cloneBoard(board);
       newBoard[move] = this.BOT;
 
       const moveValue = this.minimax(newBoard, 0, false);
 
       if (moveValue > bestValue) {
         bestValue = moveValue;
         bestMove = move;
       }
     }
 
     return bestMove;
   }
 
   // Получаем блокирующий ход (если игрок может выиграть на следующем ходу)
   getBlockingMove(board) {
     const availableMoves = this.getAvailableMoves(board);
 
     for (const move of availableMoves) {
       const newBoard = this.cloneBoard(board);
       newBoard[move] = this.PLAYER;
 
       if (this.checkWinner(newBoard) === this.PLAYER) {
         return move;
       }
     }
 
     return null;
   }
 
   // Получаем выигрышный ход для бота
   getWinningMove(board) {
     const availableMoves = this.getAvailableMoves(board);
 
     for (const move of availableMoves) {
       const newBoard = this.cloneBoard(board);
       newBoard[move] = this.BOT;
 
       if (this.checkWinner(newBoard) === this.BOT) {
         return move;
       }
     }
 
     return null;
   }
 
   // Основная логика хода бота
   makeBotMove(board) {
     // 1. Проверяем, можем ли выиграть
     const winningMove = this.getWinningMove(board);
     if (winningMove !== null) {
       return winningMove;
     }
 
     // 2. Проверяем, нужно ли блокировать игрока
     const blockingMove = this.getBlockingMove(board);
     if (blockingMove !== null) {
       return blockingMove;
     }
 
     // 3. Используем minimax для лучшего хода
     return this.getBestMove(board, 0.85); // 85% сложность для интересной игры
   }
 
   // Создаем новую игру
   createNewGame(userGoesFirst = true) {
     const botGoesFirst = Math.random() < 0.5; // 50% шанс что бот ходит первым
 
     return {
       board: Array(9).fill(null),
       currentPlayer: botGoesFirst ? 'bot' : 'player',
       winner: null,
       status: 'playing',
       botGoesFirst
     };
   }
 
   // Делаем ход игрока
   makePlayerMove(gameState, position) {
     if (gameState.status !== 'playing') {
       throw new Error('Игра уже завершена');
     }
 
     if (gameState.currentPlayer !== 'player') {
       throw new Error('Сейчас не ваш ход');
     }
 
     if (gameState.board[position] !== null) {
       throw new Error('Эта клетка уже занята');
     }
 
     // Делаем ход игрока
     const newGameState = {
       ...gameState,
       board: [...gameState.board]
     };
 
     newGameState.board[position] = this.PLAYER;
 
     // Проверяем победителя
     const winner = this.checkWinner(newGameState.board);
     if (winner) {
       newGameState.winner = winner === this.PLAYER ? 'player' : (winner === this.BOT ? 'bot' : 'draw');
       newGameState.status = 'finished';
       return newGameState;
     }
 
     // Переходим к ходу бота
     newGameState.currentPlayer = 'bot';
 
     // Делаем ход бота
     const botMove = this.makeBotMove(newGameState.board);
     if (botMove !== null) {
       newGameState.board[botMove] = this.BOT;
 
       // Проверяем победителя после хода бота
       const botWinner = this.checkWinner(newGameState.board);
       if (botWinner) {
         newGameState.winner = botWinner === this.PLAYER ? 'player' : (botWinner === this.BOT ? 'bot' : 'draw');
         newGameState.status = 'finished';
       } else {
         newGameState.currentPlayer = 'player';
       }
     }
 
     return newGameState;
   }
 
   // Делаем первый ход бота если он ходит первым
   makeBotFirstMove(gameState) {
     if (gameState.currentPlayer !== 'bot') {
       return gameState;
     }
 
     const newGameState = {
       ...gameState,
       board: [...gameState.board]
     };
 
     const botMove = this.makeBotMove(newGameState.board);
     if (botMove !== null) {
       newGameState.board[botMove] = this.BOT;
       newGameState.currentPlayer = 'player';
     }
 
     return newGameState;
   }
 }
 
 module.exports = new TicTacToeService();
 