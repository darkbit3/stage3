const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const winston = require('winston');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
require('dotenv').config();

// Logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

const app = express();

// Service configuration
const services = {
  bigserver: { url: process.env.BIGSERVER_URL || `http://localhost:${process.env.BIGSERVER_PORT}`, name: 'Big Server', connected: false },
  db_manager: { url: process.env.DB_MANAGER || `http://localhost:${process.env.DB_MANAGER_PORT}`, name: 'DB Manager', connected: false }
};

// Enhanced service connection checking with retry logic
const checkServiceConnections = async () => {
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds
  
  const checkWithRetry = async (serviceName, url, headers = {}, retries = maxRetries) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios.get(url, { timeout: 5000, headers });
        if (response.status === 200) {
          return { success: true, data: response.data };
        }
      } catch (error) {
        if (i === retries - 1) {
          throw error;
        }
        console.log(`⚠️  ${serviceName} connection attempt ${i + 1} failed, retrying in ${retryDelay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  };
  
  try {
    // Check BigServer connection with API key
    try {
      const bigserverResult = await checkWithRetry(
        'BigServer',
        services.bigserver.url,
        { 'x-api-key': process.env.BIGSERVER_API_KEY }
      );
      
      services.bigserver.connected = true;
      console.log('✅ Connected to Big Server (Port ' + process.env.BIGSERVER_PORT + ') with API key');
      console.log('   📊 Big Server Status:', bigserverResult.data.status);
      logger.info(`✅ Big Server (Port ${process.env.BIGSERVER_PORT}) is connected`);
      
    } catch (error) {
      services.bigserver.connected = false;
      console.log('❌ Failed to connect to Big Server (Port ' + process.env.BIGSERVER_PORT + '):', error.message);
      if (error.response && error.response.status === 401) {
        console.log('🔑 API Key authentication failed - check your API key configuration');
      }
      logger.warn(`❌ Big Server (Port ${process.env.BIGSERVER_PORT}) connection error: ${error.message}`);
    }

    // Check DB Manager connection
    try {
      const dbManagerResult = await checkWithRetry('DB Manager', services.db_manager.url);
      
      services.db_manager.connected = true;
      console.log('✅ Connected to DB Manager (Port ' + process.env.DB_MANAGER_PORT + ')');
      console.log('   📊 DB Manager Status:', dbManagerResult.data.status);
      console.log('   🗄️  Database Status:', dbManagerResult.data.databases?.sqlite?.status || 'Unknown');
      logger.info(`✅ DB Manager (Port ${process.env.DB_MANAGER_PORT}) is connected`);
      
    } catch (error) {
      services.db_manager.connected = false;
      console.log('❌ Failed to connect to DB Manager (Port ' + process.env.DB_MANAGER_PORT + '):', error.message);
      logger.warn(`❌ DB Manager (Port ${process.env.DB_MANAGER_PORT}) connection error: ${error.message}`);
    }
    
    // Enhanced connection summary
    const connectionStatus = {
      bigserver: services.bigserver.connected ? 'connected' : 'disconnected',
      db_manager: services.db_manager.connected ? 'connected' : 'disconnected',
      overall: (services.bigserver.connected && services.db_manager.connected) ? 'healthy' : 'degraded'
    };
    
    console.log('📊 Connection Status Summary:', connectionStatus);
    
  } catch (error) {
    console.error('Error checking service connections:', error.message);
    logger.error('Error checking service connections:', error.message);
  }
};

// Enhanced health check with detailed information
const performHealthCheck = async () => {
  const health = {
    status: 'healthy',
    stage: 'Stage 3',
    port: process.env.PORT,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    connections: {
      bigserver: {
        connected: services.bigserver.connected,
        port: process.env.BIGSERVER_PORT,
        url: services.bigserver.url,
        lastChecked: new Date().toISOString()
      },
      db_manager: {
        connected: services.db_manager.connected,
        port: process.env.DB_MANAGER_PORT,
        url: services.db_manager.url,
        lastChecked: new Date().toISOString()
      }
    },
    businessLogic: {
      stagesSupported: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'],
      amountRanges: {
        low: { stages: ['A', 'B'], amount: 10 },
        medium: { stages: ['C', 'D'], amount: 20 },
        high: { stages: ['E', 'F'], amount: 30 },
        premium: { stages: ['G', 'H'], amount: 50 },
        elite: { stages: ['I', 'J'], amount: 100 },
        ultimate: { stages: ['K', 'L'], amount: 200 }
      }
    },
    endpoints: {
      getLastGameId: `/api/v1/game/last-id?stage=<stage>`,
      getAllLastGameIds: `/api/v1/game/last-id/all`,
      createGame: `/api/v1/game/create`,
      getStageStatus: `/api/v1/game/status/<stage>`
    },
    features: {
      compression: true,
      rateLimiting: true,
      winstonLogging: true,
      enhancedErrorHandling: true,
      mongodbSupport: true
    }
  };
  
  // Determine overall health
  if (!services.bigserver.connected && !services.db_manager.connected) {
    health.status = 'unhealthy';
  } else if (!services.bigserver.connected || !services.db_manager.connected) {
    health.status = 'degraded';
  }
  
  return health;
};

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.options('*', cors());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization,x-api-key');
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX || 1000
});
app.use(limiter);

app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
const apiPrefix = '/api/v1';

// Enhanced DB Manager Integration Routes
app.get(`${apiPrefix}/game/last-id`, async (req, res) => {
  try {
    const { stage = 'e' } = req.query; // Default to stage E for Stage3
    console.log(`🔍 Stage3: Requesting last game ID from DB Manager for Stage ${stage.toUpperCase()}...`);
    
    // Request last game ID from DB Manager for specific stage
    const response = await axios.get(`${services.db_manager.url}/api/v1/stage-${stage}/last-game-id`, { 
      timeout: 10000 
    });
    
    if (response.data && response.data.success) {
      const gameData = response.data.data;
      console.log(`✅ Stage3: Received last game ID from DB Manager for Stage ${stage.toUpperCase()}:`, gameData);
      
      // Enhanced response with business logic validation
      res.json({
        success: true,
        data: {
          ...gameData,
          stage: stage.toUpperCase(),
          businessLogic: {
            amount: getStageAmount(stage.toUpperCase()),
            calculatedPayout: gameData.payout,
            playerCount: gameData.numberOfPlayerIds,
            totalBet: (gameData.numberOfPlayerIds * getStageAmount(stage.toUpperCase())),
            ownerCommission: (gameData.numberOfPlayerIds * getStageAmount(stage.toUpperCase())) * 0.2
          }
        },
        source: 'db_manager',
        stage: 'stage3',
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error('Invalid response from DB Manager');
    }
    
  } catch (error) {
    console.error('❌ Stage3: Error getting last game ID from DB Manager:', error.message);
    logger.error('Stage3: Error getting last game ID from DB Manager:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get last game ID from DB Manager',
      details: error.message,
      stage: 'stage3'
    });
  }
});

// Get last game ID for all stages
app.get(`${apiPrefix}/game/last-id/all`, async (req, res) => {
  try {
    console.log('🔍 Stage3: Requesting last game IDs from ALL stages...');
    
    const stages = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
    const results = {};
    
    for (const stage of stages) {
      try {
        const response = await axios.get(`${services.db_manager.url}/api/v1/stage-${stage}/last-game-id`, { 
          timeout: 5000 
        });
        
        if (response.data && response.data.success) {
          results[stage.toUpperCase()] = {
            ...response.data.data,
            businessLogic: {
              amount: getStageAmount(stage.toUpperCase()),
              totalBet: response.data.data.numberOfPlayerIds * getStageAmount(stage.toUpperCase()),
              payoutPercentage: 80,
              ownerPercentage: 20
            }
          };
        }
      } catch (error) {
        console.warn(`⚠️  Stage3: Failed to get data for Stage ${stage.toUpperCase()}:`, error.message);
        results[stage.toUpperCase()] = {
          error: error.message,
          available: false
        };
      }
    }
    
    const summary = {
      totalStages: stages.length,
      availableStages: Object.values(results).filter(r => !r.error).length,
      totalPayouts: Object.values(results)
        .filter(r => !r.error && r.payout)
        .reduce((sum, r) => sum + r.payout, 0)
    };
    
    console.log('✅ Stage3: Retrieved game IDs from all stages:', summary);
    
    res.json({
      success: true,
      data: results,
      summary,
      source: 'db_manager',
      stage: 'stage3',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Stage3: Error getting last game IDs from all stages:', error.message);
    logger.error('Stage3: Error getting last game IDs from all stages:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get last game IDs from all stages',
      details: error.message,
      stage: 'stage3'
    });
  }
});

// Create new game record for any stage
app.post(`${apiPrefix}/game/create`, async (req, res) => {
  try {
    const { stage, gameId, playerId, selectedBoard } = req.body;
    
    if (!stage || !gameId || !playerId || !selectedBoard) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: stage, gameId, playerId, selectedBoard'
      });
    }
    
    if (!['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].includes(stage.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stage. Must be one of: A, B, C, D, E, F, G, H, I, J, K, L'
      });
    }
    
    console.log(`🎮 Stage3: Creating new game record for Stage ${stage.toUpperCase()}...`);
    
    const gameData = {
      gameId,
      playerId,
      selectedBoard,
      status: 'active',
      stage: stage.toUpperCase()
    };
    
    const response = await axios.post(`${services.db_manager.url}/api/v1/stage-${stage}/create`, gameData, { 
      timeout: 10000 
    });
    
    if (response.data && response.data.success) {
      console.log(`✅ Stage3: Created game record for Stage ${stage.toUpperCase()}:`, response.data.data);
      
      res.json({
        success: true,
        data: response.data.data,
        message: `Game record created successfully for Stage ${stage.toUpperCase()}`,
        source: 'db_manager',
        stage: 'stage3'
      });
    } else {
      throw new Error('Invalid response from DB Manager');
    }
    
  } catch (error) {
    console.error('❌ Stage3: Error creating game record:', error.message);
    logger.error('Stage3: Error creating game record:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create game record',
      details: error.message,
      stage: 'stage3'
    });
  }
});

// Get stage status
app.get(`${apiPrefix}/game/status/:stage`, async (req, res) => {
  try {
    const { stage } = req.params;
    
    if (!['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].includes(stage.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stage. Must be one of: A, B, C, D, E, F, G, H, I, J, K, L'
      });
    }
    
    console.log(`📊 Stage3: Getting status for Stage ${stage.toUpperCase()}...`);
    
    const response = await axios.get(`${services.db_manager.url}/api/v1/stage-${stage}/status`, { 
      timeout: 5000 
    });
    
    if (response.data && response.data.success) {
      console.log(`✅ Stage3: Got status for Stage ${stage.toUpperCase()}:`, response.data.data);
      
      res.json({
        success: true,
        data: response.data.data,
        source: 'db_manager',
        stage: 'stage3'
      });
    } else {
      throw new Error('Invalid response from DB Manager');
    }
    
  } catch (error) {
    console.error(`❌ Stage3: Error getting status for stage ${req.params.stage}:`, error.message);
    logger.error(`Stage3: Error getting status for stage ${req.params.stage}:`, error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get stage status',
      details: error.message,
      stage: 'stage3'
    });
  }
});

// Get latest game data with highest game ID and parsed selectedBoard
app.get(`${apiPrefix}/game/latest-data`, async (req, res) => {
  try {
    const { stage = 'g' } = req.query; // Default to stage G for Stage3
    console.log(`🔍 Stage3: Requesting latest game data from DB Manager for Stage ${stage.toUpperCase()}...`);

    // Request highest game ID record from DB Manager for specific stage
    const response = await axios.get(`${services.db_manager.url}/api/v1/stage-${stage}/last-game-id`, {
      timeout: 10000
    });

    if (response.data && response.data.success && response.data.data) {
      const gameData = response.data.data;
      console.log(`✅ Stage3: Found existing game data for Stage ${stage.toUpperCase()}:`, gameData);

      // Parse selectedBoard format: "+251909090909:2,+251909090910:4"
      const parsedData = parseSelectedBoard(gameData.selectedBoard || '');

      // Format response for frontend
      const formattedResponse = {
        gameId: gameData.gameId || '',
        payout: gameData.payout || 0,
        players: parsedData.playerIds,
        boards: parsedData.boards,
        totalPlayers: parsedData.totalPlayers,
        stage: stage.toUpperCase(),
        timestamp: new Date().toISOString()
      };

      console.log(`✅ Stage3: Returning existing game data for frontend:`, formattedResponse);

      res.json({
        success: true,
        data: formattedResponse,
        source: 'db_manager',
        stage: 'stage3',
        timestamp: new Date().toISOString()
      });
    } else {
      // No existing data found, create a new game
      console.log(`📝 Stage3: No existing data found for Stage ${stage.toUpperCase()}, creating new game...`);

      const newGameData = await createNewGameForStage(stage.toLowerCase());
      console.log(`✅ Stage3: Created new game for Stage ${stage.toUpperCase()}:`, newGameData);

      res.json({
        success: true,
        data: newGameData,
        source: 'newly_created',
        stage: 'stage3',
        message: `New game created for Stage ${stage.toUpperCase()}`,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Stage3: Error getting latest game data from DB Manager:', error.message);
    logger.error('Stage3: Error getting latest game data from DB Manager:', error.message);

    // Try to create a new game even if DB Manager fails
    try {
      const { stage = 'g' } = req.query;
      console.log(`🔄 Stage3: DB Manager failed, attempting to create new game for Stage ${stage.toUpperCase()}...`);

      const newGameData = await createNewGameForStage(stage.toLowerCase());
      console.log(`✅ Stage3: Created fallback game for Stage ${stage.toUpperCase()}:`, newGameData);

      res.json({
        success: true,
        data: newGameData,
        source: 'fallback_created',
        stage: 'stage3',
        warning: 'DB Manager unavailable, created new game',
        timestamp: new Date().toISOString()
      });
    } catch (createError) {
      console.error('❌ Stage3: Failed to create fallback game:', createError.message);

      // Last resort fallback
      const fallbackData = {
        gameId: 'G' + Date.now().toString().slice(-5),
        payout: 0,
        players: '',
        boards: '',
        totalPlayers: 0,
        stage: stage.toUpperCase(),
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        data: fallbackData,
        source: 'emergency_fallback',
        stage: 'stage3',
        warning: 'All systems failed, using emergency fallback',
        timestamp: new Date().toISOString()
      });
    }
  }
});

// Helper function to create a new game when no data exists
async function createNewGameForStage(stage) {
  try {
    // Generate a new game ID based on current timestamp
    const timestamp = Date.now();
    const gameId = (timestamp % 100000).toString().padStart(5, '0');

    // Create sample game data based on stage
    const sampleData = getSampleDataForStage(stage);

    console.log(`🎮 Stage3: Creating new game ${gameId} for Stage ${stage.toUpperCase()} with sample data...`);

    // Try to save to DB Manager
    try {
      const response = await axios.post(`${services.db_manager.url}/api/v1/stage-${stage}/create`, {
        gameId: gameId,
        playerId: sampleData.playerId,
        selectedBoard: sampleData.selectedBoard,
        status: 'active',
        payout: sampleData.payout,
        amount: sampleData.amount
      }, {
        timeout: 10000
      });

      if (response.data && response.data.success) {
        console.log(`✅ Stage3: Successfully saved new game ${gameId} to DB Manager`);

        // Parse the saved data
        const parsedData = parseSelectedBoard(sampleData.selectedBoard);

        return {
          gameId: gameId,
          payout: sampleData.payout,
          players: parsedData.playerIds,
          boards: parsedData.boards,
          totalPlayers: parsedData.totalPlayers,
          stage: stage.toUpperCase(),
          timestamp: new Date().toISOString()
        };
      }
    } catch (dbError) {
      console.warn(`⚠️ Stage3: Failed to save to DB Manager, using in-memory data:`, dbError.message);
    }

    // Fallback: return in-memory generated data
    const parsedData = parseSelectedBoard(sampleData.selectedBoard);

    return {
      gameId: gameId,
      payout: sampleData.payout,
      players: parsedData.playerIds,
      boards: parsedData.boards,
      totalPlayers: parsedData.totalPlayers,
      stage: stage.toUpperCase(),
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error(`❌ Stage3: Error creating new game for stage ${stage}:`, error.message);
    throw error;
  }
}

// Helper function to get sample data for different stages
function getSampleDataForStage(stage) {
  const stageSamples = {
    'a': { playerId: '+251909090901,+251909090902', selectedBoard: '+251909090901:15,+251909090902:23', payout: 16, amount: 10 },
    'b': { playerId: '+251909090903,+251909090904', selectedBoard: '+251909090903:45,+251909090904:67', payout: 16, amount: 10 },
    'c': { playerId: '+251909090905,+251909090906', selectedBoard: '+251909090905:12,+251909090906:34', payout: 32, amount: 20 },
    'd': { playerId: '+251909090907,+251909090908', selectedBoard: '+251909090907:56,+251909090908:78', payout: 32, amount: 20 },
    'e': { playerId: '+251909090909,+251909090910', selectedBoard: '+251909090909:2,+251909090910:4', payout: 48, amount: 30 },
    'f': { playerId: '+251909090911,+251909090912', selectedBoard: '+251909090911:6,+251909090912:8', payout: 48, amount: 30 },
    'g': { playerId: '+251909090913,+251909090914', selectedBoard: '+251909090913:10,+251909090914:12', payout: 80, amount: 50 },
    'h': { playerId: '+251909090915,+251909090916', selectedBoard: '+251909090915:14,+251909090916:16', payout: 80, amount: 50 },
    'i': { playerId: '+251909090917,+251909090918', selectedBoard: '+251909090917:18,+251909090918:20', payout: 160, amount: 100 },
    'j': { playerId: '+251909090919,+251909090920', selectedBoard: '+251909090919:22,+251909090920:24', payout: 160, amount: 100 },
    'k': { playerId: '+251909090921,+251909090922', selectedBoard: '+251909090921:26,+251909090922:28', payout: 320, amount: 200 },
    'l': { playerId: '+251909090923,+251909090924', selectedBoard: '+251909090923:30,+251909090924:32', payout: 320, amount: 200 }
  };

  return stageSamples[stage] || stageSamples['g']; // Default to stage G if not found
}

// Helper function to get stage amount
function getStageAmount(stage) {
  const amounts = {
    'A': 10, 'B': 10,
    'C': 20, 'D': 20,
    'E': 30, 'F': 30,
    'G': 50, 'H': 50,
    'I': 100, 'J': 100,
    'K': 200, 'L': 200
  };
  return amounts[stage] || 10;
}

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Stage 3 Backend API is running!',
    stage: 'Stage 3',
    port: process.env.PORT,
    status: 'active',
    timestamp: new Date().toISOString()
  });
});

// Enhanced health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await performHealthCheck();
    res.json(health);
  } catch (error) {
    console.error('Health check error:', error.message);
    logger.error('Health check error:', error.message);
    res.status(500).json({
      status: 'error',
      error: 'Health check failed',
      details: error.message
    });
  }
});

// Enhanced services status endpoint
app.get('/services', async (req, res) => {
  try {
    await checkServiceConnections();
    
    res.json({
      stage: 'Stage 3',
      timestamp: new Date().toISOString(),
      services: {
        bigserver: {
          url: services.bigserver.url,
          connected: services.bigserver.connected,
          port: process.env.BIGSERVER_PORT,
          authenticated: !!process.env.BIGSERVER_API_KEY,
          status: services.bigserver.connected ? 'operational' : 'offline'
        },
        db_manager: {
          url: services.db_manager.url,
          connected: services.db_manager.connected,
          port: process.env.DB_MANAGER_PORT,
          status: services.db_manager.connected ? 'operational' : 'offline'
        }
      },
      overall: (services.bigserver.connected && services.db_manager.connected) ? 'all_systems_go' : 'degraded_operation'
    });
  } catch (error) {
    console.error('Services status error:', error.message);
    logger.error('Services status error:', error.message);
    res.status(500).json({
      error: 'Failed to get services status',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3003;

// Start server and check connections
app.listen(PORT, async () => {
  console.log(`🚀 Stage 3 Backend API is running on port ${PORT}`);
  console.log(`📊 Stage 3 Features: Enhanced DB Manager Integration, MongoDB Support, Winston Logging`);
  
  // Check service connections on startup
  await checkServiceConnections();
  
  // Periodic connection check
  setInterval(checkServiceConnections, 30000); // Check every 30 seconds
});

module.exports = app;
