const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const winston = require('winston');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const io = require('socket.io-client');
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
const DB_MANAGER_LOCAL_URL = `http://localhost:${process.env.DB_MANAGER_PORT || 3007}`;
const DB_MANAGER_REMOTE_URL = process.env.DB_MANAGER || 'https://db-manager-1.onrender.com';
let dbManagerUrl = DB_MANAGER_LOCAL_URL;
let dbManagerFallbackUsed = false;

const services = {
  bigserver: { url: process.env.BIGSERVER_URL || `http://localhost:${process.env.BIGSERVER_PORT}`, name: 'Big Server', connected: false },
  db_manager: { url: dbManagerUrl, name: 'DB Manager', connected: false, fallbackUsed: false }
};

// Socket.IO client for real-time connection to DB Manager
let dbManagerSocket = null;
let socketConnected = false;

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
    const tryDbManager = async (url) => {
      const result = await checkWithRetry('DB Manager', url);
      dbManagerUrl = url;
      services.db_manager.url = url;
      services.db_manager.connected = true;
      services.db_manager.fallbackUsed = url !== DB_MANAGER_LOCAL_URL;
      dbManagerFallbackUsed = services.db_manager.fallbackUsed;
      return result;
    };

    try {
      try {
        const dbManagerResult = await tryDbManager(DB_MANAGER_LOCAL_URL);
        console.log('✅ Connected to local DB Manager on port ' + process.env.DB_MANAGER_PORT);
        console.log('   📊 DB Manager Status:', dbManagerResult.data.status);
        console.log('   🗄️  Database Status:', dbManagerResult.data.databases?.sqlite?.status || 'Unknown');
        logger.info(`✅ DB Manager (Port ${process.env.DB_MANAGER_PORT}) is connected`);
      } catch (localError) {
        console.warn('⚠️ Local DB Manager failed, switching to remote DB Manager URL:', DB_MANAGER_REMOTE_URL);
        logger.warn(`⚠️ Local DB Manager connection failed, switching to fallback URL ${DB_MANAGER_REMOTE_URL}`);
        const dbManagerResult = await tryDbManager(DB_MANAGER_REMOTE_URL);
        console.log('✅ Connected to DB Manager via remote fallback');
        console.log('   📊 DB Manager Status:', dbManagerResult.data.status);
        console.log('   🗄️  Database Status:', dbManagerResult.data.databases?.sqlite?.status || 'Unknown');
        logger.info(`✅ DB Manager connected via remote fallback URL ${DB_MANAGER_REMOTE_URL}`);
      }
    } catch (error) {
      services.db_manager.connected = false;
      console.log('❌ Failed to connect to DB Manager:', error.message);
      logger.warn(`❌ DB Manager connection error: ${error.message}`);
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

// Initialize Socket.IO connection to DB Manager
const initializeSocketConnection = () => {
  if (dbManagerSocket) {
    dbManagerSocket.disconnect();
  }

  console.log('🔌 Connecting to DB Manager via Socket.IO...');
  logger.info('🔌 Connecting to DB Manager via Socket.IO...');

  dbManagerSocket = io(dbManagerUrl, {
    transports: ['websocket', 'polling'],
    timeout: 5000,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });

  dbManagerSocket.on('connect', () => {
    console.log('✅ Connected to DB Manager via Socket.IO');
    logger.info('✅ Connected to DB Manager via Socket.IO');
    socketConnected = true;

    // Identify as stage3
    dbManagerSocket.emit('stage3-connect', {
      stage: 'stage3',
      timestamp: new Date().toISOString(),
      port: process.env.PORT
    });
  });

  dbManagerSocket.on('db-manager-connected', (data) => {
    console.log('🎯 DB Manager acknowledged connection:', data);
    logger.info('🎯 DB Manager acknowledged connection:', data);
  });

  dbManagerSocket.on('game-data-update', (data) => {
    console.log('📊 Real-time game data update received:', data);
    logger.info('📊 Real-time game data update received:', data);
    // Handle real-time game data updates
    // This can be used to cache data or notify connected clients
  });

  dbManagerSocket.on('bet-update', (data) => {
    console.log('🎯 Real-time bet update received:', data);
    logger.info('🎯 Real-time bet update received:', data);
    // Handle real-time bet notifications
  });

  dbManagerSocket.on('db-status-update', (data) => {
    console.log('🗄️ Real-time DB status update:', data);
    logger.info('🗄️ Real-time DB status update:', data);
  });

  dbManagerSocket.on('connect_error', (error) => {
    console.log('❌ Socket.IO connection error:', error.message);
    logger.warn('❌ Socket.IO connection error:', error.message);
    socketConnected = false;

    if (!dbManagerFallbackUsed && dbManagerUrl === DB_MANAGER_LOCAL_URL) {
      console.warn('⚠️ Local WebSocket fail, switching to remote DB Manager URL and retrying...');
      dbManagerUrl = DB_MANAGER_REMOTE_URL;
      services.db_manager.url = DB_MANAGER_REMOTE_URL;
      dbManagerFallbackUsed = true;
      services.db_manager.fallbackUsed = true;
      dbManagerSocket.disconnect();
      initializeSocketConnection();
    }
  });

  dbManagerSocket.on('disconnect', (reason) => {
    console.log('🔌 Disconnected from DB Manager:', reason);
    logger.info('🔌 Disconnected from DB Manager:', reason);
    socketConnected = false;
  });

  dbManagerSocket.on('reconnect', (attemptNumber) => {
    console.log(`🔄 Reconnected to DB Manager after ${attemptNumber} attempts`);
    logger.info(`🔄 Reconnected to DB Manager after ${attemptNumber} attempts`);
    socketConnected = true;
  });
};

// Request real-time game data
const requestRealtimeGameData = async (stage = 'e') => {
  if (dbManagerSocket && socketConnected) {
    console.log(`📊 Requesting real-time game data for Stage ${stage.toUpperCase()}`);
    logger.info(`📊 Requesting real-time game data for Stage ${stage.toUpperCase()}`);
    dbManagerSocket.emit('request-game-data', { stage });
    return;
  }

  if (services.db_manager.connected) {
    try {
      console.warn('⚠️ Socket not connected, using HTTP fallback for real-time game data');
      const response = await axios.get(`${services.db_manager.url}/api/v1/stage-${stage}/last-game-id`, {
        timeout: 10000
      });

      if (response.data && response.data.success) {
        console.log(`✅ HTTP fallback game data received for Stage ${stage.toUpperCase()}`);
        io.emit('game-data-update', {
          stage: stage.toUpperCase(),
          data: response.data.data,
          timestamp: new Date().toISOString(),
          source: 'db_manager_http_fallback'
        });
      } else {
        console.warn('⚠️ HTTP fallback game data request returned invalid response');
      }
    } catch (error) {
      console.error('❌ HTTP fallback failed for real-time game data:', error.message);
    }
    return;
  }

  console.log('⚠️ No DB Manager connection available for real-time game data');
};

// Send bet placement notification
const notifyBetPlaced = (betData) => {
  if (dbManagerSocket && socketConnected) {
    console.log('🎯 Sending bet placement notification via Socket.IO');
    logger.info('🎯 Sending bet placement notification via Socket.IO');
    dbManagerSocket.emit('bet-placed', betData);
  } else {
    console.log('⚠️ Socket not connected, bet notification not sent');
    logger.warn('⚠️ Socket not connected, bet notification not sent');
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
        lastChecked: new Date().toISOString(),
        realtime: {
          socketConnected: socketConnected,
          socketId: dbManagerSocket ? dbManagerSocket.id : null
        }
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

// Helper function to parse selectedBoard format
function parseSelectedBoard(selectedBoard) {
  try {
    if (!selectedBoard || typeof selectedBoard !== 'string') {
      return {
        playerIds: '',
        boards: '',
        totalPlayers: 0
      };
    }
    
    console.log('🔍 Parsing selectedBoard:', selectedBoard);
    
    // Split by comma to get individual player:board pairs
    const pairs = selectedBoard.split(',');
    
    const playerIds = [];
    const boards = [];
    
    pairs.forEach(pair => {
      if (pair && pair.includes(':')) {
        const parts = pair.split(':');
        if (parts.length >= 2) {
          // Player ID is the first part, board number is the last part
          const playerId = parts[0].trim();
          const boardNum = parts[parts.length - 1].trim();
          
          if (playerId && boardNum) {
            playerIds.push(playerId);
            boards.push(boardNum);
            console.log(`✅ Parsed: ${playerId} → Board ${boardNum}`);
          }
        }
      }
    });
    
    const result = {
      playerIds: playerIds.join(','),
      boards: boards.join(','),
      totalPlayers: playerIds.length
    };
    
    console.log('✅ Parse result:', result);
    return result;
    
  } catch (error) {
    console.error('Error parsing selectedBoard:', error);
    return {
      playerIds: '',
      boards: '',
      totalPlayers: 0
    };
  }
}

// Helper function to create a new game when no data exists
async function createNewGameForStage(stage) {
  try {
    // Generate a new game ID based on current timestamp
    const timestamp = Date.now();
    const gameId = (timestamp % 100000).toString().padStart(5, '0');

    console.log(`🎮 Stage3: No existing game data found for Stage ${stage.toUpperCase()}`);

    // Return empty game state - no sample data
    return {
      gameId: gameId,
      payout: 0,
      players: '',
      boards: '',
      totalPlayers: 0,
      stage: stage.toUpperCase(),
      timestamp: new Date().toISOString(),
      message: 'No active game found. Please place bets to start a new game.'
    };

  } catch (error) {
    console.error(`❌ Stage3: Error creating empty game response for stage ${stage}:`, error.message);
    throw error;
  }
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

// Real-time connection test endpoint
app.get('/api/v1/realtime/status', (req, res) => {
  res.json({
    success: true,
    realtime: {
      socketConnected: socketConnected,
      socketId: dbManagerSocket ? dbManagerSocket.id : null,
      dbManagerUrl: services.db_manager.url
    },
    timestamp: new Date().toISOString()
  });
});

// Request real-time game data endpoint
app.get('/api/v1/realtime/game-data/:stage?', (req, res) => {
  const stage = req.params.stage || 'g'; // Stage 3 defaults to stage G
  
  if (!socketConnected) {
    return res.status(503).json({
      success: false,
      error: 'Real-time connection not available'
    });
  }
  
  requestRealtimeGameData(stage);
  
  res.json({
    success: true,
    message: `Requested real-time game data for Stage ${stage.toUpperCase()}`,
    timestamp: new Date().toISOString()
  });
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
  
  // Initialize Socket.IO connection to DB Manager
  initializeSocketConnection();
  
  // Periodic connection check
  setInterval(checkServiceConnections, 30000); // Check every 30 seconds
  
  // Request initial game data every 10 seconds
  setInterval(() => {
    requestRealtimeGameData('g'); // Stage 3 defaults to stage G
  }, 10000);
});

module.exports = app;
