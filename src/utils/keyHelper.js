const logger = require('../config/logger');
const { buildPoseidon } = require('circomlibjs');
const KeyGenerator = require('../key-management/KeyGenerator'); // Import your KeyGenerator

// Initialize KeyGenerator once (can be reused)
const keyGenerator = new KeyGenerator();

/**
 * Get the public key from the active encrypted key
 * @param {string} password - Password to decrypt the key
 * @returns {Promise<string>} Public key hex string
 */
const getPublicKeyFromActiveKey = async () => {
    try {
        const password = process.env.KEY_PASSWORD || 'vishnusks';
        logger.info('🔹 Loading active key to get public key...');

        // Load the active key pair (requires password)
        const keyPair = await keyGenerator.loadKeyPair(password);

        logger.info(`✅ Successfully loaded public key: ${keyPair.publicKey.substring(0, 32)}...`);
        logger.info(`   Key ID: ${keyPair.id}`);
        logger.info(`   Library: ${keyPair.library}`);

        return keyPair.publicKey;

    } catch (error) {
        logger.error(`❌ Failed to get public key: ${error.message}`);
        throw new Error(`Failed to get public key from active key: ${error.message}`);
    }
};

/**
 * Get the public key from a specific encrypted key file
 * @param {string} password - Password to decrypt the key
 * @param {string} keyFile - Optional specific key file name
 * @returns {Promise<string>} Public key hex string
 */
const getPublicKeyFromKeyFile = async (keyFile = null) => {
    try {
        const password = process.env.KEY_PASSWORD || 'vishnusks';

        logger.info(`🔹 Loading key from ${keyFile || 'default location'}...`);

        let keyPair;

        if (keyFile) {
            // Load specific key file using storage directly
            const encryptedPackage = keyGenerator.storage.load(keyFile);
            if (!encryptedPackage) {
                throw new Error(`Key file not found: ${keyFile}`);
            }
            keyPair = keyGenerator.encryption.extractKeyPair(encryptedPackage, password);
        } else {
            // Load the active key
            keyPair = await keyGenerator.loadKeyPair(password);
        }

        logger.info(`✅ Successfully loaded public key: ${keyPair.publicKey.substring(0, 32)}...`);

        return keyPair.publicKey;

    } catch (error) {
        logger.error(`❌ Failed to get public key from file: ${error.message}`);
        throw error;
    }
};



/**
 * Get private key from active key or specified key file
 * @param {string} keyFile - Optional specific key file to load
 * @param {string} providedPassword - Optional password (uses env if not provided)
 * @returns {Promise<Object>} Private key info
 */
const getPrivateKeyFromKeyFile = async (keyFile = null, providedPassword = null) => {
    try {
        const password = providedPassword || process.env.KEY_PASSWORD || 'vishnusks';

        logger.info(`🔹 Loading private key from ${keyFile || 'active key'}...`);

        // Create key generator instance
        const KeyGenerator = require('../key-management/KeyGenerator');
        const keyGenerator = new KeyGenerator();

        let keyPair;

        if (keyFile) {
            // Load specific key file using storage directly
            const encryptedPackage = keyGenerator.storage.load(keyFile);
            if (!encryptedPackage) {
                throw new Error(`Key file not found: ${keyFile}`);
            }
            keyPair = keyGenerator.encryption.extractKeyPair(encryptedPackage, password);
        } else {
            // Load the active key
            keyPair = await keyGenerator.loadKeyPair(password);
        }

        logger.info(`✅ Successfully loaded private key for: ${keyPair.id}`);
        logger.info(`   Public key: ${keyPair.publicKey.substring(0, 32)}...`);
        logger.info(`   Library: ${keyPair.library}`);

        return {
            success: true,
            privateKey: keyPair.privateKey,
            privateKeyHex: keyPair.privateKey,
            keyId: keyPair.id,
            publicKey: keyPair.publicKey,
            library: keyPair.library,
            createdAt: keyPair.createdAt
        };

    } catch (error) {
        logger.error(`❌ Failed to get private key: ${error.message}`);
        throw new Error(`Failed to get private key: ${error.message}`);
    }
};

/**
 * Get private key as buffer (useful for signing operations)
 * @param {string} keyFile - Optional specific key file
 * @param {string} providedPassword - Optional password
 * @returns {Promise<Buffer>} Private key as buffer
 */
const getPrivateKeyBuffer = async (keyFile = null, providedPassword = null) => {
    try {
        const result = await getPrivateKeyFromKeyFile(keyFile, providedPassword);
        return {
            buffer: Buffer.from(result.privateKey, 'hex'),
            keyId: result.keyId,
            publicKey: result.publicKey
        };
    } catch (error) {
        logger.error(`Failed to get private key buffer: ${error.message}`);
        throw error;
    }
};
/**
 * Get public key from environment variable or .env file
 * @returns {string|null} Public key or null if not found
 */
const getPublicKeyFromEnv = () => {
    const publicKey = process.env.PUBLIC_KEY;
    if (publicKey) {
        logger.info('✅ Using PUBLIC_KEY from environment');
        return publicKey;
    }
    logger.warn('⚠️ No PUBLIC_KEY found in environment');
    return null;
};





/**
 * List all available keys and their public keys (requires password)
 * @param {string} password - Password to decrypt keys
 * @returns {Promise<Array>} List of keys with public keys
 */
const listKeysWithPublicKeys = async (password) => {
    try {
        const keys = keyGenerator.listKeys();
        const result = [];

        for (const key of keys) {
            try {
                // Try to load each key to get its public key
                const encryptedPackage = keyGenerator.storage.load(key.name);
                const keyPair = keyGenerator.encryption.extractKeyPair(encryptedPackage, password);

                result.push({
                    filename: key.name,
                    keyId: keyPair.id,
                    library: keyPair.library,
                    publicKey: keyPair.publicKey,
                    isActive: key.isActive,
                    createdAt: keyPair.createdAt
                });
            } catch (error) {
                logger.warn(`Failed to decrypt key ${key.name}: ${error.message}`);
                result.push({
                    filename: key.name,
                    error: 'Invalid password or corrupted key',
                    isActive: key.isActive
                });
            }
        }

        return result;

    } catch (error) {
        logger.error(`Failed to list keys: ${error.message}`);
        throw error;
    }
};

module.exports = {
    getPublicKeyFromActiveKey,
    getPublicKeyFromKeyFile,
    getPublicKeyFromEnv,
    listKeysWithPublicKeys,
    getPrivateKeyBuffer,
    getPrivateKeyFromKeyFile
};