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

// GET /api/stage-d - Get all Stage D records
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, gameId, playerId, status } = req.query;
    
    const filters = {};
    if (gameId) filters.gameId = gameId;
    if (playerId) filters.playerId = playerId;
    if (status) filters.status = status;
    
    const result = await dbManager.getStageD(filters);
    
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

// GET /api/stage-d/:id - Get specific Stage D record
router.get('/:id', async (req, res, next) => {
  try {
    const result = await dbManager.getStageD({ id: req.params.id });
    const record = (result.data || result).find(item => item._id === req.params.id || item.id === req.params.id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Stage D record not found'
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

// POST /api/stage-d - Create new Stage D record
router.post('/', async (req, res, next) => {
  try {
    const {
      gameId,
      playerId,
      amount,
      totalBet,
      owner,
      selectedBoard,
      numberCalling
    } = req.body;
    
    if (!gameId || !playerId || !owner) {
      return res.status(400).json({
        success: false,
        error: 'gameId, playerId, and owner are required'
      });
    }
    
    const stageDData = {
      gameId,
      playerId,
      amount: amount || 0,
      totalBet: totalBet || 0,
      owner,
      selectedBoard,
      status: 'active',
      numberCalling: {
        currentNumber: null,
        calledNumbers: [],
        callHistory: [],
        callingPattern: numberCalling?.callingPattern || 'random',
        callInterval: numberCalling?.callInterval || 5000,
        lastCallTime: new Date(),
        autoCallEnabled: numberCalling?.autoCallEnabled !== false
      },
      numberStats: {
        totalCalled: 0,
        averageCallTime: 0,
        letterDistribution: {
          B: 0,
          I: 0,
          N: 0,
          G: 0,
          O: 0
        }
      }
    };
    
    const result = await dbManager.createStageD(stageDData);
    
    res.status(201).json({
      success: true,
      data: result,
      message: 'Stage D record created successfully'
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/stage-d/:id - Update Stage D record
router.put('/:id', async (req, res, next) => {
  try {
    const updateData = req.body;
    
    // Add updated timestamp
    updateData.updatedAt = new Date();
    
    const result = await dbManager.updateStageD(req.params.id, updateData);
    
    res.json({
      success: true,
      data: result,
      message: 'Stage D record updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/stage-d/:id - Delete Stage D record
router.delete('/:id', async (req, res, next) => {
  try {
    await dbManager.deleteStageD(req.params.id);
    
    res.json({
      success: true,
      message: 'Stage D record deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stage-d/game/:gameId - Get all records for a specific game
router.get('/game/:gameId', async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const { status } = req.query;
    
    const filters = { gameId };
    if (status) filters.status = status;
    
    const result = await dbManager.getStageD(filters);
    
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

// GET /api/stage-d/player/:playerId - Get all records for a specific player
router.get('/player/:playerId', async (req, res, next) => {
  try {
    const { playerId } = req.params;
    const { status, gameId } = req.query;
    
    const filters = { playerId };
    if (status) filters.status = status;
    if (gameId) filters.gameId = gameId;
    
    const result = await dbManager.getStageD(filters);
    
    // Calculate player statistics
    const records = result.data || result;
    const stats = {
      totalGames: records.length,
      activeGames: records.filter(r => r.status === 'active').length,
      completedGames: records.filter(r => r.status === 'completed').length,
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

// POST /api/stage-d/call-number/:gameId - Call a new number
router.post('/call-number/:gameId', async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const { number } = req.body;
    
    if (!number || number < 1 || number > 75) {
      return res.status(400).json({
        success: false,
        error: 'Invalid number. Must be between 1 and 75'
      });
    }
    
    // Get letter for the number
    const letters = ['B', 'I', 'N', 'G', 'O'];
    const letter = letters[Math.floor((number - 1) / 15)];
    const adjustedNumber = ((number - 1) % 15) + 1;
    
    // Update all active games for this game
    const filters = { gameId, status: 'active' };
    const activeGames = await dbManager.getStageD(filters);
    
    if (activeGames.data && activeGames.data.length > 0) {
      for (const game of activeGames.data) {
        const updateData = {
          numberCalling: {
            currentNumber: number,
            calledNumbers: [...(game.numberCalling?.calledNumbers || []), number],
            callHistory: [
              ...(game.numberCalling?.callHistory || []),
              {
                number,
                letter,
                calledAt: new Date(),
                callOrder: (game.numberCalling?.callHistory?.length || 0) + 1
              }
            ],
            lastCallTime: new Date()
          }
        };
        
        await dbManager.updateStageD(game._id, updateData);
      }
    }
    
    res.json({
      success: true,
      message: `Number ${number} (${letter}${adjustedNumber}) called successfully`,
      gameId,
      number,
      letter
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stage-d/called-numbers/:gameId - Get called numbers for a game
router.get('/called-numbers/:gameId', async (req, res, next) => {
  try {
    const { gameId } = req.params;
    
    const filters = { gameId, status: 'active' };
    const activeGames = await dbManager.getStageD(filters);
    
    if (activeGames.data && activeGames.data.length > 0) {
      const game = activeGames.data[0]; // Get first active game
      const calledNumbers = game.numberCalling?.calledNumbers || [];
      const callHistory = game.numberCalling?.callHistory || [];
      
      res.json({
        success: true,
        data: {
          gameId,
          currentNumber: game.numberCalling?.currentNumber,
          calledNumbers,
          callHistory: callHistory.sort((a, b) => a.callOrder - b.callOrder),
          totalCalled: calledNumbers.length,
          letterDistribution: game.numberCalling?.letterDistribution || { B: 0, I: 0, N: 0, G: 0, O: 0 }
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No active game found'
      });
    }
  } catch (error) {
    next(error);
  }
});

// POST /api/stage-d/batch - Batch operations
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
            result = await dbManager.createStageD(operation.data);
            break;
          case 'update':
            result = await dbManager.updateStageD(operation.id, operation.data);
            break;
          case 'delete':
            result = await dbManager.deleteStageD(operation.id);
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
