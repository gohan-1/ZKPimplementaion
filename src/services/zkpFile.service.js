const httpStatus = require('http-status');
const { getCurveFromName } = require('ffjavascript'); // Correct import
const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const entropy = require('../utils/entropy');

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
        await snarkjs.powersOfTau.contribute(pot0, pot1, 'First contribution', randomEntropy);
        logger.info('✅ Contribution complete: pot12_0001.ptau');

        // Step 3: Prepare Phase 2
        logger.info('🔹 Step 3: Preparing Phase 2...');
        await snarkjs.powersOfTau.preparePhase2(pot1, potFinal);
        logger.info('✅ Phase 2 prepared: pot12_final.ptau');

        return 'Phase 2 prepared: pot12_final.ptau';
    } catch (error) {
        // Log detailed error
        logger.error('❌ Trusted Setup failed:', error);

        // Throw a consistent ApiError for upstream handling
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Trusted Setup Ceremony failed. See logs for details.');
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

        const zkey = path.join(tauDir, 'first.zkey'); // initial zKey
        const fZkey = path.join(tauDir, 'final.zkey'); // final zKey
        const potFinal = path.join(tauDir, finalKey); // final ptau
        const fCircuit = path.join(circuitDir, circuit); // circuit file

        logger.info(potFinal);
        logger.info(fCircuit);

        logger.info(
            {
                circuit: fCircuit,
                ptau: potFinal,
                zkey,
                fZkey,
            },
            '📌 File paths prepared'
        );

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

const generateVKey = async (finalZKey) => {
    try {
        logger.info('🔹 Starting Verification Key Generation...');

        // Step 0: Setup directories
        const tauDir = path.join(__dirname, '../../Project_v1/tau_files');
        const verifierDir = path.join(__dirname, '../../Project_v1/VerifierData');

        // Ensure directories exist
        if (!fs.existsSync(verifierDir)) {
            fs.mkdirSync(verifierDir, { recursive: true });
        }

        const fZkey = path.join(tauDir, finalZKey);
        const outputFile = path.join(verifierDir, 'verification_key.json');

        logger.info(
            {
                zkey: fZkey,
                output: outputFile,
            },
            '📌 File paths prepared'
        );

        // Step 1: Export verification key
        try {
            logger.info('🔹 Step 1: Exporting verification key...');
            const vKey = await snarkjs.zKey.exportVerificationKey(fZkey);
            logger.info('✅ Verification key generated successfully');

            // Step 2: Save to file
            fs.writeFileSync(outputFile, JSON.stringify(vKey, null, 2));
            logger.info('✅ Verification key saved to file');
        } catch (error) {
            logger.error({ error }, '❌ Failed to export verification key');
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to generate verification key');
        }

        logger.info('🎉 Verification Key Generation completed successfully!');
        return 'Verification Key generated successfully';
    } catch (error) {
        logger.error({ error }, '❌ Verification Key Generation failed');
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Verification Key Generation failed. See logs for details.');
    }
};

/**
 * Generates a witness file from input JSON for a zk-SNARK circuit.
 * @param {Object} inputJson - The input data for witness generation
 * @param {string} wasmFileName - The .wasm file for the circuit
 * @returns {Promise<string>} - Success message
 */
const generateWitness = async (inputJson, wasmFileName) => {
    try {
        logger.info('🔹 Starting Witness Generation...');

        // Step 0: Setup directories
        const wasmDir = path.join(__dirname, '../../Project_v1/ZKPFiles/zkpCircuit_js');
        const witnessDir = path.join(__dirname, '../../Project_v1/ZKPFiles');

        const wasmPath = path.join(wasmDir, wasmFileName);
        const witnessFile = path.join(witnessDir, 'witness.wtns');

        logger.info(
            {
                wasm: wasmPath,
                output: witnessFile,
            },
            '📌 File paths prepared'
        );

        // Validate input JSON
        if (!inputJson || typeof inputJson !== 'object') {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid input JSON for witness generation');
        }

        // Step 1: Generate witness
        try {
            logger.info('🔹 Step 1: Calculating witness...');
            await snarkjs.wtns.calculate(inputJson, wasmPath, witnessFile);
            logger.info('✅ Witness generated successfully');
        } catch (error) {
            logger.error({ error }, '❌ Witness generation failed');
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Witness generation failed. See logs for details.');
        }

        logger.info('🎉 Witness Generation completed successfully!');
        return 'Witness generated successfully';
    } catch (error) {
        logger.error({ error }, '❌ Witness Generation failed');
        if (error instanceof ApiError) throw error;
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Witness Generation failed. See logs for details.');
    }
};

/**
 * Generate proof (Groth16 or PLONK) from witness and zKey
 * @param {string} witnessFileName - witness file path
 * @param {string} zkeyFileName - final zKey file path
 * @param {'groth16'|'plonk'} protocol - zk-SNARK protocol
 * @returns {Promise<Object>} - proof and publicSignals
 */
const generateProof = async (witnessFileName, zkeyFileName, protocol = 'groth16') => {
    try {
        logger.info('🔹 Starting Proof Generation...');

        const witnessDir = path.join(__dirname, '../../Project_v1/ZKPFiles');
        // Step 0: Setup directories
        const tauDir = path.join(__dirname, '../../Project_v1/tau_files');

        const witnessFile = path.join(witnessDir, witnessFileName);

        const fZkey = path.join(tauDir, zkeyFileName);

        let proofData;
        if (protocol === 'plonk') {
            logger.info('🔹 Generating PLONK proof...');
            proofData = await snarkjs.plonk.prove(fZkey, witnessFile);
        } else if (protocol === 'fflonk') {
            logger.info('🔹 Generating flonk proof...');
            proofData = await snarkjs.fflonk.prove(fZkey, witnessFile);
        } else if (protocol === 'groth16') {
            logger.info('🔹 Generating Groth16 proof...');
            proofData = await snarkjs.groth16.prove(fZkey, witnessFile);
        } else {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid protocol specified');
        }

        const proofsDir = path.join(__dirname, '../../proofs');
        if (!fs.existsSync(proofsDir)) {
            fs.mkdirSync(proofsDir, { recursive: true });
        }

        // Save proof and public signals with literal paths
        const proofFile = path.join(proofsDir, `${protocol}_proof.json`);
        const publicFile = path.join(proofsDir, `${protocol}_public.json`);
        fs.writeFileSync(proofFile, JSON.stringify(proofData.proof, null, 2));
        fs.writeFileSync(publicFile, JSON.stringify(proofData.publicSignals, null, 2));

        logger.info('✅ Proof generated successfully', { proofFile, publicFile });
        return { proof: proofData.proof, publicSignals: proofData.publicSignals };
    } catch (error) {
        logger.error({
            errorMessage: error.message,
            stack: error.stack,
            witnessFileName,
            zkeyFileName,
            protocol
        }, '❌ Proof Generation failed');

        // Throw a more informative ApiError with the real cause
        throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            `Proof Generation failed: ${error.message}`
        );
    }
};

/**
 * Verify proof (Groth16 or PLONK) using verification key
 * @param {string} verificationKeyFile - path to verification_key.json
 * @param {Array} publicSignals - public signals array
 * @param {Object} proof - proof object
 * @param {'groth16'|'plonk'} protocol - zk-SNARK protocol
 * @returns {Promise<boolean>} - verification result
 */
const verifyProof = async (vKeyJson, publicSignals, proof, protocol = 'groth16') => {
    try {
        logger.info('🔹 Starting Proof Verification...');

        let verified;

        if (protocol === 'plonk') {
            verified = await snarkjs.plonk.verify(vKeyJson, publicSignals, proof);
        } else if (protocol === 'fflonk') {
            verified = await snarkjs.fflonk.verify(vKeyJson, publicSignals, proof);
        } else if (protocol === 'groth16') {
            verified = await snarkjs.groth16.verify(vKeyJson, publicSignals, proof);
        } else {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid protocol specified');
        }

        logger.info('✅ Proof verification result:', { verified });
        return verified;
    } catch (error) {
        // ✅ Log full context
        logger.error({
            errorMessage: error.message,
            stack: error.stack,
            protocol,
            publicSignals,
            proofSample: JSON.stringify(proof).slice(0, 200) // prevent huge logs
        }, '❌ Proof Verification failed');

        throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            `Proof Verification failed: ${error.message}`
        );

    }
};

module.exports = {
    ceremony,
    InitialKeyGeneration,
    generateVKey,
    generateWitness,
    verifyProof,
    generateProof,
};
