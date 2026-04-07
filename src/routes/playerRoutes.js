const express = require('express');
const router = express.Router();

// Mock player data for Stage 3
let players = [
  {
    id: 'player1',
    name: 'John Doe',
    email: 'john@example.com',
    stage: 'Stage 3',
    currentGame: 1,
    games: [
      {
        gameId: 1,
        joinedAt: new Date().toISOString(),
        status: 'active',
        cards: ['card1', 'card2'],
        markedNumbers: [],
        hasWon: false
      }
    ],
    statistics: {
      gamesPlayed: 5,
      gamesWon: 2,
      totalCards: 12,
      winRate: 40
    }
  }
];

// GET /api/players - Get all players
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: players,
    count: players.length,
    stage: 'Stage 3 - Game Management'
  });
});

// GET /api/players/:id - Get specific player
router.get('/:id', (req, res) => {
  const player = players.find(p => p.id === req.params.id);
  if (!player) {
    return res.status(404).json({
      success: false,
      error: 'Player not found'
    });
  }
  res.json({
    success: true,
    data: player
  });
});

// GET /api/players/:id/statistics - Get player statistics
router.get('/:id/statistics', (req, res) => {
  const player = players.find(p => p.id === req.params.id);
  if (!player) {
    return res.status(404).json({
      success: false,
      error: 'Player not found'
    });
  }
  
  res.json({
    success: true,
    data: player.statistics
  });
});

// POST /api/players/:id/join-game - Join a game
router.post('/:id/join-game', (req, res) => {
  const player = players.find(p => p.id === req.params.id);
  if (!player) {
    return res.status(404).json({
      success: false,
      error: 'Player not found'
    });
  }
  
  const { gameId } = req.body;
  
  if (!gameId) {
    return res.status(400).json({
      success: false,
      error: 'Game ID is required'
    });
  }
  
  // Check if player is already in this game
  if (player.games.find(g => g.gameId === gameId)) {
    return res.status(400).json({
      success: false,
      error: 'Player is already in this game'
    });
  }
  
  const gameEntry = {
    gameId,
    joinedAt: new Date().toISOString(),
    status: 'joined',
    cards: [],
    markedNumbers: [],
    hasWon: false
  };
  
  player.games.push(gameEntry);
  player.currentGame = gameId;
  
  res.json({
    success: true,
    data: gameEntry,
    message: 'Player joined game successfully'
  });
});

// POST /api/players/:id/leave-game - Leave a game
router.post('/:id/leave-game', (req, res) => {
  const player = players.find(p => p.id === req.params.id);
  if (!player) {
    return res.status(404).json({
      success: false,
      error: 'Player not found'
    });
  }
  
  const { gameId } = req.body;
  
  if (!gameId) {
    return res.status(400).json({
      success: false,
      error: 'Game ID is required'
    });
  }
  
  const gameIndex = player.games.findIndex(g => g.gameId === gameId);
  if (gameIndex === -1) {
    return res.status(404).json({
      success: false,
      error: 'Player is not in this game'
    });
  }
  
  const gameEntry = player.games.splice(gameIndex, 1)[0];
  
  if (player.currentGame === gameId) {
    player.currentGame = null;
  }
  
  res.json({
    success: true,
    data: gameEntry,
    message: 'Player left game successfully'
  });
});

// POST /api/players/:id/mark-number - Mark a number on player's card
router.post('/:id/mark-number', (req, res) => {
  const player = players.find(p => p.id === req.params.id);
  if (!player) {
    return res.status(404).json({
      success: false,
      error: 'Player not found'
    });
  }
  
  const { gameId, number, cardId } = req.body;
  
  if (!gameId || !number || !cardId) {
    return res.status(400).json({
      success: false,
      error: 'Game ID, number, and card ID are required'
    });
  }
  
  const game = player.games.find(g => g.gameId === gameId);
  if (!game) {
    return res.status(404).json({
      success: false,
      error: 'Player is not in this game'
    });
  }
  
  // Add number to marked numbers
  if (!game.markedNumbers.includes(number)) {
    game.markedNumbers.push(number);
  }
  
  res.json({
    success: true,
    data: {
      number,
      cardId,
      markedAt: new Date().toISOString()
    },
    message: 'Number marked successfully'
  });
});

// POST /api/players/:id/claim-win - Claim a win
router.post('/:id/claim-win', (req, res) => {
  const player = players.find(p => p.id === req.params.id);
  if (!player) {
    return res.status(404).json({
      success: false,
      error: 'Player not found'
    });
  }
  
  const { gameId, pattern, cardId } = req.body;
  
  if (!gameId || !pattern || !cardId) {
    return res.status(400).json({
      success: false,
      error: 'Game ID, pattern, and card ID are required'
    });
  }
  
  const game = player.games.find(g => g.gameId === gameId);
  if (!game) {
    return res.status(404).json({
      success: false,
      error: 'Player is not in this game'
    });
  }
  
  if (game.hasWon) {
    return res.status(400).json({
      success: false,
      error: 'Player has already won this game'
    });
  }
  
  // Mark as winner (in real implementation, would validate the pattern)
  game.hasWon = true;
  game.winPattern = pattern;
  game.wonAt = new Date().toISOString();
  
  // Update statistics
  player.statistics.gamesWon += 1;
  player.statistics.winRate = Math.round((player.statistics.gamesWon / player.statistics.gamesPlayed) * 100);
  
  res.json({
    success: true,
    data: {
      gameId,
      playerId: player.id,
      pattern,
      cardId,
      wonAt: game.wonAt
    },
    message: 'Win claimed successfully'
  });
});

module.exports = router;
