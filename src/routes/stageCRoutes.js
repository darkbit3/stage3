const express = require('express');
const DatabaseManager = require('../models/DatabaseManager');
const router = express.Router();

const dbManager = new DatabaseManager();

// Middleware to handle database errors
const handleDatabaseError = (error, req, res, next) => {
  console.error('Database operation error:', error);
  res.status(500).json({
    success: false,
    error: 'Database operation failed',
    message: error.message
  });
};

// GET /api/stage-c - Get all Stage C records
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, gameId, playerId, status } = req.query;
    
    const filters = {};
    if (gameId) filters.gameId = gameId;
    if (playerId) filters.playerId = playerId;
    if (status) filters.status = status;
    
    const result = await dbManager.getStageC(filters);
    
    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedData = (result.data || result).slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: (result.data || result).length,
        pages: Math.ceil((result.data || result).length / limit)
      },
      filters: { gameId, playerId, status }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stage-c/:id - Get specific Stage C record
router.get('/:id', async (req, res, next) => {
  try {
    const result = await dbManager.getStageC({ id: req.params.id });
    const record = (result.data || result).find(item => item._id === req.params.id || item.id === req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Stage C record not found'
      });
    }
    
    res.json({
      success: true,
      data: record
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/stage-c - Create new Stage C record
router.post('/', async (req, res, next) => {
  try {
    const {
      gameId,
      playerId,
      amount,
      totalBet,
      owner,
      selectedBoard,
      gameManagement
    } = req.body;
    
    if (!gameId || !playerId || !owner) {
      return res.status(400).json({
        success: false,
        error: 'gameId, playerId, and owner are required'
      });
    }
    
    const stageCData = {
      gameId,
      playerId,
      amount: amount || 0,
      totalBet: totalBet || 0,
      owner,
      selectedBoard,
      status: 'active',
      gameManagement: {
        gameSettings: {
          autoCallNumbers: gameManagement?.gameSettings?.autoCallNumbers !== false,
          callInterval: gameManagement?.gameSettings?.callInterval || 5000,
          winPatterns: gameManagement?.gameSettings?.winPatterns || [],
          maxWinners: gameManagement?.gameSettings?.maxWinners || 3
        },
        gameControl: {
          isPaused: false,
          isStarted: false,
          isStopped: false,
          startTime: new Date(),
          endTime: null,
          duration: 0
        },
        playerActions: {
          joinedAt: new Date(),
          lastAction: new Date(),
          actionHistory: [{
            action: 'joined',
            timestamp: new Date(),
            details: { stage: 'C' }
          }]
        }
      }
    };
    
    const result = await dbManager.createStageC(stageCData);
    
    res.status(201).json({
      success: true,
      data: result,
      message: 'Stage C record created successfully'
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/stage-c/:id - Update Stage C record
router.put('/:id', async (req, res, next) => {
  try {
    const updateData = req.body;
    
    // Add updated timestamp
    updateData.updatedAt = new Date();
    
    const result = await dbManager.updateStageC(req.params.id, updateData);
    
    res.json({
      success: true,
      data: result,
      message: 'Stage C record updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/stage-c/:id - Delete Stage C record
router.delete('/:id', async (req, res, next) => {
  try {
    await dbManager.deleteStageC(req.params.id);
    
    res.json({
      success: true,
      message: 'Stage C record deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stage-c/game/:gameId - Get all records for a specific game
router.get('/game/:gameId', async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const { status } = req.query;
    
    const filters = { gameId };
    if (status) filters.status = status;
    
    const result = await dbManager.getStageC(filters);
    
    res.json({
      success: true,
      data: result.data || result,
      gameId,
      count: (result.data || result).length
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stage-c/player/:playerId - Get all records for a specific player
router.get('/player/:playerId', async (req, res, next) => {
  try {
    const { playerId } = req.params;
    const { status, gameId } = req.query;
    
    const filters = { playerId };
    if (status) filters.status = status;
    if (gameId) filters.gameId = gameId;
    
    const result = await dbManager.getStageC(filters);
    
    // Calculate player statistics
    const records = result.data || result;
    const stats = {
      totalGames: records.length,
      activeGames: records.filter(r => r.status === 'active').length,
      completedGames: records.filter(r => r.status === 'completed').length,
      pausedGames: records.filter(r => r.gameManagement?.gameControl?.isPaused).length,
      totalBet: records.reduce((sum, r) => sum + (r.totalBet || 0), 0),
      totalPayout: records.reduce((sum, r) => sum + (r.payout || 0), 0),
      averageBet: records.length > 0 ? records.reduce((sum, r) => sum + (r.totalBet || 0), 0) / records.length : 0
    };
    
    res.json({
      success: true,
      data: records,
      playerId,
      statistics: stats,
      filters: { status, gameId }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/stage-c/start-game/:gameId - Start a game
router.post('/start-game/:gameId', async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const { settings } = req.body;
    
    // Update game control to start
    const updateData = {
      gameManagement: {
        gameControl: {
          isPaused: false,
          isStarted: true,
          isStopped: false,
          startTime: new Date(),
          endTime: null,
          duration: 0
        },
        gameSettings: settings || {}
      }
    };
    
    // Update all active games for this game
    const filters = { gameId, status: 'active' };
    const activeGames = await dbManager.getStageC(filters);
    
    if (activeGames.data && activeGames.data.length > 0) {
      for (const game of activeGames.data) {
        await dbManager.updateStageC(game._id, updateData);
      }
    }
    
    res.json({
      success: true,
      message: `Game ${gameId} started successfully`,
      gameId
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/stage-c/pause-game/:gameId - Pause a game
router.post('/pause-game/:gameId', async (req, res, next) => {
  try {
    const { gameId } = req.params;
    
    const updateData = {
      gameManagement: {
        gameControl: {
          isPaused: true,
          isStarted: true,
          isStopped: false,
          endTime: null,
          duration: 0
        }
      }
    };
    
    // Update all active games for this game
    const filters = { gameId, status: 'active' };
    const activeGames = await dbManager.getStageC(filters);
    
    if (activeGames.data && activeGames.data.length > 0) {
      for (const game of activeGames.data) {
        await dbManager.updateStageC(game._id, updateData);
      }
    }
    
    res.json({
      success: true,
      message: `Game ${gameId} paused successfully`,
      gameId
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/stage-c/stop-game/:gameId - Stop a game
router.post('/stop-game/:gameId', async (req, res, next) => {
  try {
    const { gameId } = req.params;
    
    const updateData = {
      gameManagement: {
        gameControl: {
          isPaused: false,
          isStarted: false,
          isStopped: true,
          endTime: new Date(),
          duration: 0
        }
      }
    };
    
    // Update all active games for this game
    const filters = { gameId, status: 'active' };
    const activeGames = await dbManager.getStageC(filters);
    
    if (activeGames.data && activeGames.data.length > 0) {
      for (const game of activeGames.data) {
        await dbManager.updateStageC(game._id, updateData);
      }
    }
    
    res.json({
      success: true,
      message: `Game ${gameId} stopped successfully`,
      gameId
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/stage-c/batch - Batch operations
router.post('/batch', async (req, res, next) => {
  try {
    const { operations } = req.body;
    
    if (!Array.isArray(operations)) {
      return res.status(400).json({
        success: false,
        error: 'Operations must be an array'
      });
    }
    
    const results = [];
    
    for (const operation of operations) {
      try {
        let result;
        switch (operation.type) {
          case 'create':
            result = await dbManager.createStageC(operation.data);
            break;
          case 'update':
            result = await dbManager.updateStageC(operation.id, operation.data);
            break;
          case 'delete':
            result = await dbManager.deleteStageC(operation.id);
            break;
          default:
            result = { error: 'Invalid operation type' };
        }
        
        results.push({
          operation: operation.type,
          id: operation.id,
          success: true,
          data: result
        });
      } catch (error) {
        results.push({
          operation: operation.type,
          id: operation.id,
          success: false,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      data: results,
      message: 'Batch operations completed'
    });
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
router.use(handleDatabaseError);

module.exports = router;
