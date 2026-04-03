const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');
const merkleTreeService = require('./services/MerkleTreeService'); // Import Merkle service
const Credential = require('./models/credential.model'); // Import your credential model

let server;

// Flag to track Merkle initialization
let merkleInitialized = false;

/**
 * Initialize Merkle tree after MongoDB is connected
 */
async function initializeMerkleTree() {
  // Check if Merkle tree is enabled in config
  if (process.env.MERKLE_TREE_ENABLED !== 'true') {
    logger.info('🌲 Merkle tree is disabled (set MERKLE_TREE_ENABLED=true to enable)');
    return false;
  }

  try {
    logger.info('🌲 Initializing Merkle tree...');

    // Initialize the Merkle tree service
    await merkleTreeService.initialize();

    // Build tree from existing credentials in database
    const credentials = await Credential.find({ isActive: true }).lean();

    if (credentials.length > 0) {
      logger.info(`📄 Found ${credentials.length} credentials, building Merkle tree...`);
      await merkleTreeService.buildFromDatabase(Credential);
    } else {
      logger.info('📄 No credentials found, keeping zero root');
    }

    const rootInfo = merkleTreeService.getCurrentRoot();
    logger.info(`✅ Merkle tree initialized - Root: ${rootInfo.root}, Version: ${rootInfo.version}, Leaves: ${rootInfo.leafCount}`);

    return true;
  } catch (error) {
    logger.error('❌ Failed to initialize Merkle tree:', error);
    return false;
  }
}

// Connect to MongoDB
mongoose.connect(config.mongoose.url, config.mongoose.options).then(async () => {
  logger.info('Connected to MongoDB');

  // Initialize Merkle tree after DB connection
  merkleInitialized = await initializeMerkleTree();

  // Start server only after Merkle tree is initialized (or gracefully handle failure)
  server = app.listen(config.port, () => {
    logger.info(`Listening to port ${config.port}`);
    if (merkleInitialized) {
      logger.info('🌲 Merkle tree service is active and ready');
    } else if (process.env.MERKLE_TREE_ENABLED === 'true') {
      logger.warn('⚠️ Merkle tree initialization failed, but server continues');
    }
  });
}).catch((error) => {
  logger.error('MongoDB connection error:', error);
  process.exit(1);
});

// Graceful shutdown handler
const exitHandler = () => {
  if (server) {
    server.close(async () => {
      logger.info('Server closed');

      // Optional: Save Merkle tree state before shutdown
      if (merkleInitialized && merkleTreeService.saveSnapshot) {
        try {
          await merkleTreeService.saveSnapshot();
          logger.info('Merkle tree state saved');
        } catch (error) {
          logger.error('Failed to save Merkle tree state:', error);
        }
      }

      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = async (error) => {
  logger.error('Unhandled error:', error);

  // Save Merkle state before crashing if possible
  if (merkleInitialized && merkleTreeService.saveSnapshot) {
    try {
      await merkleTreeService.saveSnapshot();
    } catch (err) {
      // Ignore save errors during crash
    }
  }

  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received');

  // Save Merkle state before shutting down
  if (merkleInitialized && merkleTreeService.saveSnapshot) {
    try {
      await merkleTreeService.saveSnapshot();
      logger.info('Merkle tree state saved before SIGTERM');
    } catch (error) {
      logger.error('Failed to save Merkle tree state:', error);
    }
  }

  if (server) {
    server.close();
  }
});

// Export for testing purposes
module.exports = { server, merkleInitialized };