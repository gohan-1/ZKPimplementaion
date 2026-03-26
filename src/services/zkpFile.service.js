const httpStatus = require('http-status');
const { getCurveFromName } = require('ffjavascript'); // Correct import
const snarkjs = require('snarkjs');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const entropy = require('../utils/entropy');

const fs = require('fs');
const path = require('path');

/**
 * Perform a Trusted Setup Ceremony for zk-SNARKs
 *
 * This function performs a multi-step trusted setup:
 * 1. Create Powers of Tau (ptau)
 * 2. Contribute randomness
 * 3. Prepare Phase 2
 * 4. Optional: Create and contribute to initial zKey
 * 5. Optional: Export verification key
 *
 * @returns {Promise<void>}
 * @throws {ApiError} Throws ApiError if any step fails
 */
const ceremony = async () => {
    try {
        logger.info('🔹 Starting Trusted Setup (this may take a while)...');

        // Step 0: Load elliptic curve
        const curve = await getCurveFromName('bn128');
        logger.info('✅ Curve loaded: bn128');


        const tauDir = path.join(__dirname, '../../Project_v1/tau_files');


        // Create the directory if it does not exist
        if (!fs.existsSync(tauDir)) {
            fs.mkdirSync(tauDir, { recursive: true });
        }
        const pot0 = path.join(tauDir, 'pot12_0000.ptau');
        const pot1 = path.join(tauDir, 'pot12_0001.ptau');
        const potFinal = path.join(tauDir, 'pot12_final.ptau');
        // Step 1: Create Powers of Tau (ptau)
        logger.info('🔹 Step 1: Creating Powers of Tau...');
        await snarkjs.powersOfTau.newAccumulator(curve, 12, pot0);
        logger.info('✅ ptau accumulator created: pot12_0000.ptau');



        // Step 2: Contribute randomness


        logger.info('🔹 Step 2: Contributing entropy...');
        const randomEntropy = await entropy(); // Generate entropy string
        await snarkjs.powersOfTau.contribute(
            pot0,
            pot1,
            'First contribution',
            randomEntropy
        );
        logger.info('✅ Contribution complete: pot12_0001.ptau');

        // Step 3: Prepare Phase 2
        logger.info('🔹 Step 3: Preparing Phase 2...');
        await snarkjs.powersOfTau.preparePhase2(pot1, potFinal);
        logger.info('✅ Phase 2 prepared: pot12_final.ptau');

        return "Phase 2 prepared: pot12_final.ptau"

        logger.info('🎉 Trusted Setup Ceremony completed successfully!');
    } catch (error) {
        // Log detailed error
        logger.error('❌ Trusted Setup failed:', error);

        // Throw a consistent ApiError for upstream handling
        throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            'Trusted Setup Ceremony failed. See logs for details.'
        );
    }
};


/**
 * Generate initial and final zKey for zk-SNARKs
 *
 * Steps:
 * 1. Load file paths and ensure directories exist
 * 2. Create initial zKey
 * 3. Contribute entropy to zKey
 *
 * @param {string} circuit - Circuit file name (e.g., factor.r1cs)
 * @param {string} finalKey - Final ptau file name (e.g., pot12_final.ptau)
 * @returns {Promise<string>} Success message
 * @throws {ApiError} Throws ApiError if any step fails
 */
const InitialKeyGeneration = async (circuit, finalKey) => {
    try {


        // Step 0: Setup directories
        const tauDir = path.join(__dirname, '../../Project_v1/tau_files');
        const circuitDir = path.join(__dirname, '../../Project_v1/ZKPFiles');



        const zkey = path.join(tauDir, 'first.zkey');    // initial zKey
        const fZkey = path.join(tauDir, 'final.zkey');   // final zKey
        const potFinal = path.join(tauDir, finalKey);    // final ptau
        const fCircuit = path.join(circuitDir, circuit); // circuit file

        logger.info(potFinal)
        logger.info(fCircuit)

        logger.info({
            circuit: fCircuit,
            ptau: potFinal,
            zkey,
            fZkey
        }, '📌 File paths prepared');

        // Step 1: Create initial zKey
        try {
            logger.info('🔹 Step 1: Creating initial zKey...');
            await snarkjs.zKey.newZKey(fCircuit, potFinal, zkey);
            logger.info('✅ Initial zKey created successfully');
        } catch (error) {
            logger.error({ error }, '❌ Failed to create initial zKey');
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create initial zKey');
        }

        // Step 2: Contribute entropy to zKey
        try {
            logger.info('🔹 Step 2: Contributing entropy to zKey...');
            const entropyValue = await entropy(); // generate secure entropy string
            await snarkjs.zKey.contribute(zkey, fZkey, 'Vishnu contribution', entropyValue);
            logger.info('✅ zKey contribution completed successfully');
        } catch (error) {
            logger.error({ error }, '❌ Failed during zKey contribution');

            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed during zKey contribution');
        }

        logger.info('🎉 Initial Key Generation completed successfully!');
        return 'Initial Key Generation completed successfully';
    } catch (error) {
        // Global catch for unexpected failures
        logger.error({ error }, '❌ Initial Key Generation failed');

        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Initial Key Generation failed. See logs for details.');
    }
};


module.exports = {
    ceremony,
    InitialKeyGeneration
};