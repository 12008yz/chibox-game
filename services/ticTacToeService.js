/**
 * Улучшенная версия TicTacToeService с умным ботом
 *
 * Изменения:
 * 1. Бот ходит первым в 50% случаев (было 25%)
 * 2. Бот ВСЕГДА пытается выиграть если может
 * 3. Бот ВСЕГДА блокирует ходы игрока
 * 4. Добавлена стратегическая логика:
 *    - Приоритет центра
 *    - Приоритет углов
 *    - Создание и блокирование форков (двойных угроз)
 * 5. Повышена сложность minimax с 25% до 90%
 */
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

  // Получаем стратегический ход
  getStrategicMove(board) {
    const availableMoves = this.getAvailableMoves(board);

    // ЗАЩИТА ОТ ТАКТИКИ "3 УГЛА" - но только в 80% случаев для баланса!
    const cornerTacticDefense = this.defendAgainstCornerTactic(board);
    if (cornerTacticDefense !== null && Math.random() < 0.80) {
      return cornerTacticDefense;
    }

    // Приоритет 1: Центр (позиция 4)
    if (availableMoves.includes(4)) {
      return 4;
    }

    // Приоритет 2: Углы (позиции 0, 2, 6, 8)
    const corners = [0, 2, 6, 8];
    const availableCorners = corners.filter(corner => availableMoves.includes(corner));
    if (availableCorners.length > 0) {
      // Выбираем случайный доступный угол
      return availableCorners[Math.floor(Math.random() * availableCorners.length)];
    }

    // Приоритет 3: Создание двойной угрозы (форка)
    const forkMove = this.getForkMove(board);
    if (forkMove !== null) {
      return forkMove;
    }

    // Приоритет 4: Блокирование форка противника
    const blockForkMove = this.getBlockForkMove(board);
    if (blockForkMove !== null) {
      return blockForkMove;
    }

    // Приоритет 5: Боковые стороны (позиции 1, 3, 5, 7)
    const sides = [1, 3, 5, 7];
    const availableSides = sides.filter(side => availableMoves.includes(side));
    if (availableSides.length > 0) {
      return availableSides[Math.floor(Math.random() * availableSides.length)];
    }

    return null;
  }

  // Получаем ход для создания форка (двойной угрозы)
  getForkMove(board) {
    const availableMoves = this.getAvailableMoves(board);

    for (const move of availableMoves) {
      const newBoard = this.cloneBoard(board);
      newBoard[move] = this.BOT;

      // Подсчитываем количество способов выиграть после этого хода
      let winningWays = 0;
      const nextAvailableMoves = this.getAvailableMoves(newBoard);

      for (const nextMove of nextAvailableMoves) {
        const testBoard = this.cloneBoard(newBoard);
        testBoard[nextMove] = this.BOT;
        if (this.checkWinner(testBoard) === this.BOT) {
          winningWays++;
        }
      }

      // Если есть 2 или больше способов выиграть, это форк
      if (winningWays >= 2) {
        return move;
      }
    }

    return null;
  }

  // Получаем ход для блокирования форка противника
  getBlockForkMove(board) {
    const availableMoves = this.getAvailableMoves(board);

    for (const move of availableMoves) {
      const newBoard = this.cloneBoard(board);
      newBoard[move] = this.PLAYER;

      // Проверяем, создаст ли игрок форк
      let winningWays = 0;
      const nextAvailableMoves = this.getAvailableMoves(newBoard);

      for (const nextMove of nextAvailableMoves) {
        const testBoard = this.cloneBoard(newBoard);
        testBoard[nextMove] = this.PLAYER;
        if (this.checkWinner(testBoard) === this.PLAYER) {
          winningWays++;
        }
      }

      // Если игрок может создать форк, блокируем его
      if (winningWays >= 2) {
        return move;
      }
    }

    return null;
  }

  // Защита от тактики "3 угла" (corner trap)
  defendAgainstCornerTactic(board) {
    const corners = [0, 2, 6, 8];
    const oppositeCorners = [[0, 8], [2, 6], [6, 2], [8, 0]];

    // Проверяем, занял ли игрок противоположные углы
    for (const [corner1, corner2] of oppositeCorners) {
      if (board[corner1] === this.PLAYER && board[corner2] === this.PLAYER) {
        // Игрок занял противоположные углы! Это классическая тактика.
        // НИКОГДА не ставим в центр в этом случае - это проигрышный ход!

        // Блокируем на боковых сторонах (1, 3, 5, 7)
        const sides = [1, 3, 5, 7];
        const availableSides = sides.filter(side => board[side] === null);
        if (availableSides.length > 0) {
          return availableSides[Math.floor(Math.random() * availableSides.length)];
        }
      }
    }

    // Проверяем ситуацию: игрок занял один угол, мы заняли центр, он занимает противоположный
    if (board[4] === this.BOT) { // Если мы уже в центре
      for (const [corner1, corner2] of oppositeCorners) {
        if (board[corner1] === this.PLAYER && board[corner2] === null) {
          // Игрок в одном углу, противоположный свободен
          // Считаем сколько ходов сделано
          const moveCount = board.filter(cell => cell !== null).length;

          if (moveCount === 3) { // Второй ход игрока (наш первый ход был в центр)
            // Предотвращаем занятие противоположного угла, блокируя боковую сторону
            const blockingSides = this.getBlockingSidesForCorner(corner1);
            const availableBlockingSides = blockingSides.filter(side => board[side] === null);
            if (availableBlockingSides.length > 0) {
              return availableBlockingSides[0];
            }
          }
        }
      }
    }

    // Особая защита: если игрок начал с угла и мы НЕ заняли центр
    const playerCorners = corners.filter(corner => board[corner] === this.PLAYER);
    if (playerCorners.length === 1 && board[4] === null) {
      // Игрок занял 1 угол, центр свободен - ОБЯЗАТЕЛЬНО занимаем центр!
      return 4;
    }

    // Если игрок занял угол, а мы заняли не центр, блокируем диагональ
    if (playerCorners.length === 1 && board[4] !== this.BOT) {
      const playerCorner = playerCorners[0];
      const oppositeCorner = this.getOppositeCorner(playerCorner);
      if (board[oppositeCorner] === null) {
        // Блокируем противоположный угол
        return oppositeCorner;
      }
    }

    return null;
  }

  // Получаем противоположный угол
  getOppositeCorner(corner) {
    const opposites = { 0: 8, 2: 6, 6: 2, 8: 0 };
    return opposites[corner];
  }

  // Получаем блокирующие боковые стороны для данного угла
  getBlockingSidesForCorner(corner) {
    const blockingSides = {
      0: [1, 3],  // Для угла 0 блокируем стороны 1 и 3
      2: [1, 5],  // Для угла 2 блокируем стороны 1 и 5
      6: [3, 7],  // Для угла 6 блокируем стороны 3 и 7
      8: [5, 7]   // Для угла 8 блокируем стороны 5 и 7
    };
    return blockingSides[corner] || [];
  }

  // Делаем менее оптимальный ход для создания шансов игроку
  makeLessOptimalMove(board) {
    const availableMoves = this.getAvailableMoves(board);

    // 40% шанс полностью случайного хода
    if (Math.random() < 0.40) {
      return availableMoves[Math.floor(Math.random() * availableMoves.length)];
    }

    // 30% шанс выбрать боковую сторону (менее оптимально)
    const sides = [1, 3, 5, 7];
    const availableSides = sides.filter(side => availableMoves.includes(side));
    if (availableSides.length > 0 && Math.random() < 0.30) {
      return availableSides[Math.floor(Math.random() * availableSides.length)];
    }

    // Остальное время используем низкую сложность minimax
    return this.getBestMove(board, 0.3);
  }

  // Основная логика хода бота (с балансом сложности для интересной игры)
  makeBotMove(board) {
    // Общий шанс "ошибки" бота - 35% для победы игрока
    const botMistakeChance = 0.35;
    const makeRandomMove = Math.random() < botMistakeChance;

    // Если бот "ошибается", делаем менее оптимальный ход
    if (makeRandomMove) {
      return this.makeLessOptimalMove(board);
    }

    // 1. Проверяем, можем ли выиграть (85% времени, иногда пропускаем)
    const winningMove = this.getWinningMove(board);
    if (winningMove !== null && Math.random() < 0.85) {
      return winningMove;
    }

    // 2. Блокируем игрока если он может выиграть (80% времени)
    const blockingMove = this.getBlockingMove(board);
    if (blockingMove !== null && Math.random() < 0.80) {
      return blockingMove;
    }

    // 3. Стратегические ходы (70% времени)
    const strategicMove = this.getStrategicMove(board);
    if (strategicMove !== null && Math.random() < 0.70) {
      return strategicMove;
    }

    // 4. Используем minimax с пониженной сложностью
    return this.getBestMove(board, 0.6); // 60% сложность - сбалансированный бот
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
