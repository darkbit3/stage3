const express = require('express');
const router = express.Router();

// Mock game data for Stage 3 (Game Management)
let games = [
  {
    id: 1,
    name: 'Bingo Game 1',
    stage: 'Stage 3',
    status: 'active',
    settings: {
      autoCallNumbers: true,
      callInterval: 5000,
      winPatterns: ['line', 'full_house', 'four_corners'],
      maxWinners: 3
    },
    currentNumber: null,
    calledNumbers: [],
    winners: [],
    startTime: new Date().toISOString(),
    players: [
      {
        id: 'player1',
        name: 'John Doe',
        cards: ['card1', 'card2'],
        markedNumbers: []
      }
    ]
  }
];

// GET /api/games - Get all games
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: games,
    count: games.length,
    stage: 'Stage 3 - Game Management'
  });
});

// GET /api/games/:id - Get specific game
router.get('/:id', (req, res) => {
  const game = games.find(g => g.id === parseInt(req.params.id));
  if (!game) {
    return res.status(404).json({
      success: false,
      error: 'Game not found'
    });
  }
  res.json({
    success: true,
    data: game
  });
});

// POST /api/games - Create new game
router.post('/', (req, res) => {
  const { name, settings } = req.body;
  
  if (!name) {
    return res.status(400).json({
      success: false,
      error: 'Game name is required'
    });
  }
  
  const newGame = {
    id: games.length + 1,
    name,
    stage: 'Stage 3',
    status: 'waiting',
    settings: {
      autoCallNumbers: true,
      callInterval: 5000,
      winPatterns: ['line', 'full_house'],
      maxWinners: 1,
      ...settings
    },
    currentNumber: null,
    calledNumbers: [],
    winners: [],
    startTime: null,
    players: []
  };
  
  games.push(newGame);
  
  res.status(201).json({
    success: true,
    data: newGame,
    message: 'Game created successfully'
  });
});

// PUT /api/games/:id/settings - Update game settings
router.put('/:id/settings', (req, res) => {
  const game = games.find(g => g.id === parseInt(req.params.id));
  if (!game) {
    return res.status(404).json({
      success: false,
      error: 'Game not found'
    });
  }
  
  const { settings } = req.body;
  if (settings) {
    game.settings = { ...game.settings, ...settings };
  }
  
  res.json({
    success: true,
    data: game.settings,
    message: 'Game settings updated successfully'
  });
});

// POST /api/games/:id/start - Start a game
router.post('/:id/start', (req, res) => {
  const game = games.find(g => g.id === parseInt(req.params.id));
  if (!game) {
    return res.status(404).json({
      success: false,
      error: 'Game not found'
    });
  }
  
  if (game.status === 'active') {
    return res.status(400).json({
      success: false,
      error: 'Game is already active'
    });
  }
  
  if (game.players.length < 1) {
    return res.status(400).json({
      success: false,
      error: 'At least one player is required to start the game'
    });
  }
  
  game.status = 'active';
  game.startTime = new Date().toISOString();
  game.calledNumbers = [];
  game.winners = [];
  game.currentNumber = null;
  
  res.json({
    success: true,
    data: game,
    message: 'Game started successfully'
  });
});

// POST /api/games/:id/pause - Pause a game
router.post('/:id/pause', (req, res) => {
  const game = games.find(g => g.id === parseInt(req.params.id));
  if (!game) {
    return res.status(404).json({
      success: false,
      error: 'Game not found'
    });
  }
  
  if (game.status !== 'active') {
    return res.status(400).json({
      success: false,
      error: 'Game is not active'
    });
  }
  
  game.status = 'paused';
  
  res.json({
    success: true,
    data: game,
    message: 'Game paused successfully'
  });
});

// POST /api/games/:id/resume - Resume a game
router.post('/:id/resume', (req, res) => {
  const game = games.find(g => g.id === parseInt(req.params.id));
  if (!game) {
    return res.status(404).json({
      success: false,
      error: 'Game not found'
    });
  }
  
  if (game.status !== 'paused') {
    return res.status(400).json({
      success: false,
      error: 'Game is not paused'
    });
  }
  
  game.status = 'active';
  
  res.json({
    success: true,
    data: game,
    message: 'Game resumed successfully'
  });
});

// POST /api/games/:id/stop - Stop a game
router.post('/:id/stop', (req, res) => {
  const game = games.find(g => g.id === parseInt(req.params.id));
  if (!game) {
    return res.status(404).json({
      success: false,
      error: 'Game not found'
    });
  }
  
  game.status = 'stopped';
  
  res.json({
    success: true,
    data: game,
    message: 'Game stopped successfully'
  });
});

// GET /api/games/:id/history - Get game history
router.get('/:id/history', (req, res) => {
  const game = games.find(g => g.id === parseInt(req.params.id));
  if (!game) {
    return res.status(404).json({
      success: false,
      error: 'Game not found'
    });
  }
  
  const history = {
    gameId: game.id,
    gameName: game.name,
    startTime: game.startTime,
    endTime: game.status === 'stopped' ? new Date().toISOString() : null,
    status: game.status,
    calledNumbers: game.calledNumbers,
    winners: game.winners,
    playerCount: game.players.length,
    duration: game.startTime ? 
      Math.floor((new Date() - new Date(game.startTime)) / 1000) : null
  };
  
  res.json({
    success: true,
    data: history
  });
});

module.exports = router;
