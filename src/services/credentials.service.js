const logger = require('../config/logger');

const { buildPoseidon } = require('circomlibjs');
const { getPublicKeyFromKeyFile, getPrivateKeyBuffer } = require('../utils/keyHelper');
const KeyGenerator = require('../key-management/KeyGenerator');
const dotenv = require('dotenv');
const path = require('path')


dotenv.config();

/**
 * Generates a Poseidon hash for a given userId and issuerId
 * @param {string|number} userId 
 * @param {string|number} issuerId 
 * @returns {string} hash
 */
const createCredentialHash = async (userId, issuerId) => {
    const step = 'Creating Credential Hash';
    try {
        if (!userId || !issuerId) {
            throw new Error('Missing userId or issuerId');
        }

        logger.info(`🔹 Step: ${step} - Generating hash for userId=${userId}, issuerId=${issuerId}`);

        const poseidonHash = await buildPoseidon();
        const hash = poseidonHash([BigInt(userId), BigInt(issuerId)]);

        const pubKey = await getPublicKeyFromKeyFile()
        logger.info(`✅ Step: ${step} - Hash generated successfully`);
        return { success: true, credentialHash: poseidonHash.F.toString(hash), userId, issuerId, pubKey };

    } catch (error) {
        logger.error(`❌ Step: ${step} failed: ${error.message}`, { stack: error.stack });
        // Throw error so controller can send a proper response
        throw new Error(`Failed to create credential hash: ${error.message}`);
    }
};


const signHash = async (hash) => {
    const step = 'Creating Credential Hash';
    try {
        const witnessDir = path.join(__dirname, '../../Project_v1/ZKPFiles/keys');
        const keyfile = path.join(witnessDir, 'active_key.json');

        if (!keyfile || !hash) {
            throw new Error('Missing keyfile or hash');
        }



        const password = process.env.KEY_PASSWORD || 'vishnusks';
        if (!hash) {
            throw new Error('Hash is required for signing');
        }

        if (!password) {
            throw new Error('Password is required to access the key');
        }

        const keyGenerator = new KeyGenerator();
        const bufferPrivateKey = await getPrivateKeyBuffer()

        // Sign the hash
        const signature = await keyGenerator.sign(hash, password, bufferPrivateKey);

        logger.info(`✅ Step: ${step} - Hash signed successfully`);

        return {
            success: true,
            signature: signature,
            hash: hash,
            timestamp: Date.now()
        };

    } catch (error) {
        logger.error(`❌ Step: ${step} failed: ${error.message}`, { stack: error.stack });
        // Throw error so controller can send a proper response
        throw new Error(`Failed to create credential hash: ${error.message}`);
    }
};


const verifyHash = async (data) => {
    try {
        const {
            credentialHash,
            signatureR8x,
            signatureS,
            issuerPublicKeyX
        } = data;

        const keyGenerator = new KeyGenerator();

        const isValid = keyGenerator.verify(
            credentialHash,
            {
                r8x: signatureR8x,
                s: signatureS
            },
            issuerPublicKeyX
        );

        return {
            isValid,
            message: isValid ? '✅ Signature valid' : '❌ Invalid signature'
        };

    } catch (error) {
        throw new Error(`Verification failed: ${error.message}`);
    }
};
module.exports = {
    createCredentialHash,
    signHash,
    verifyHash
};