const httpStatus = require('http-status');
const { getCurveFromName } = require('ffjavascript');
const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const entropy = require('../utils/entropy');

/**
 * Centralized error handler for all zk-SNARK steps
 */
const handleError = (error, step, context = {}) => {
    logger.error({
        step,
        context,
        message: error.message,
        stack: error.stack
    }, `❌ ${step} failed`);
    throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        `${step} failed: ${error.message}`
    );
};

/**
 * Perform Trusted Setup Ceremony (Powers of Tau & Phase 2)
 */
const ceremony = async () => {
    const step = 'Trusted Setup Ceremony';
    try {
        logger.info('🔹 Starting Trusted Setup (this may take a while)...');

        const curve = await getCurveFromName('bn128');
        logger.info('✅ Curve loaded: bn128');

        const tauDir = path.join(__dirname, '../../Project_v1/tau_files');
        if (!fs.existsSync(tauDir)) fs.mkdirSync(tauDir, { recursive: true });

        const pot0 = path.join(tauDir, 'pot12_0000.ptau');
        const pot1 = path.join(tauDir, 'pot12_0001.ptau');
        const potFinal = path.join(tauDir, 'pot12_final.ptau');

        logger.info('🔹 Step 1: Creating Powers of Tau...');
        await snarkjs.powersOfTau.newAccumulator(curve, 12, pot0);
        logger.info('✅ ptau accumulator created: pot12_0000.ptau');

        logger.info('🔹 Step 2: Contributing entropy...');
        const randomEntropy = await entropy();
        await snarkjs.powersOfTau.contribute(pot0, pot1, 'First contribution', randomEntropy);
        logger.info('✅ Contribution complete: pot12_0001.ptau');

        logger.info('🔹 Step 3: Preparing Phase 2...');
        await snarkjs.powersOfTau.preparePhase2(pot1, potFinal);
        logger.info('✅ Phase 2 prepared: pot12_final.ptau');

        return 'Phase 2 prepared: pot12_final.ptau';
    } catch (error) {
        handleError(error, step);
    }
};

/**
 * Generate initial and final zKey
 */
const InitialKeyGeneration = async (circuit, finalKey) => {
    const step = 'Initial Key Generation';
    try {
        const tauDir = path.join(__dirname, '../../Project_v1/tau_files');
        const circuitDir = path.join(__dirname, '../../Project_v1/ZKPFiles');

        const zkey = path.join(tauDir, 'first.zkey');
        const fZkey = path.join(tauDir, 'final.zkey');
        const potFinal = path.join(tauDir, finalKey);
        const fCircuit = path.join(circuitDir, circuit);

        logger.info({ fCircuit, potFinal, zkey, fZkey }, '📌 File paths prepared');

        // Step 1: Create initial zKey
        try {
            logger.info('🔹 Step 1: Creating initial zKey...');
            await snarkjs.zKey.newZKey(fCircuit, potFinal, zkey);

            // ✅ Validate file
            if (!fs.existsSync(zkey)) {
                throw new Error("zKey file not created");
            }

            const stats = fs.statSync(zkey);

            // 🚨 VERY IMPORTANT CHECK
            if (stats.size < 100000) {   // ~100KB minimum expected
                throw new Error("zKey file is corrupted or incomplete");
            } logger.info('✅ Initial zKey created successfully');
        } catch (error) {
            handleError(error, 'Creating initial zKey', { fCircuit, potFinal, zkey });
        }

        // Step 2: Contribute entropy to zKey
        try {
            logger.info('🔹 Step 2: Contributing entropy to zKey...');
            const entropyValue = await entropy();
            await snarkjs.zKey.contribute(zkey, fZkey, 'Vishnu contribution', entropyValue);
            logger.info('✅ zKey contribution completed successfully');
        } catch (error) {
            handleError(error, 'Contributing entropy to zKey', { zkey, fZkey });
        }

        logger.info('🎉 Initial Key Generation completed successfully!');
        return 'Initial Key Generation completed successfully';
    } catch (error) {
        handleError(error, step);
    }
};

/**
 * Generate verification key from final zKey
 */
const generateVKey = async (finalZKey) => {
    const step = 'Verification Key Generation';
    try {
        const tauDir = path.join(__dirname, '../../Project_v1/tau_files');
        const verifierDir = path.join(__dirname, '../../Project_v1/VerifierData');
        if (!fs.existsSync(verifierDir)) fs.mkdirSync(verifierDir, { recursive: true });

        const fZkey = path.join(tauDir, finalZKey);
        const outputFile = path.join(verifierDir, 'verification_key.json');

        try {
            logger.info('🔹 Exporting verification key...');
            const vKey = await snarkjs.zKey.exportVerificationKey(fZkey);
            fs.writeFileSync(outputFile, JSON.stringify(vKey, null, 2));
            logger.info('✅ Verification key saved successfully');
        } catch (error) {
            handleError(error, 'Exporting verification key', { fZkey, outputFile });
        }

        logger.info('🎉 Verification Key Generation completed successfully!');
        return 'Verification Key generated successfully';
    } catch (error) {
        handleError(error, step);
    }
};

/**
 * Generate witness file
 */
const generateWitness = async (inputJson, wasmFileName) => {
    const step = 'Witness Generation';
    try {
        if (!inputJson || typeof inputJson !== 'object') {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid input JSON for witness generation');
        }

        const wasmDir = path.join(__dirname, '../../Project_v1/ZKPFiles/zkpCircuit_js');
        const witnessDir = path.join(__dirname, '../../Project_v1/ZKPFiles');
        const wasmPath = path.join(wasmDir, wasmFileName);
        const witnessFile = path.join(witnessDir, 'witness.wtns');

        try {
            logger.info('🔹 Calculating witness...');
            await snarkjs.wtns.calculate(inputJson, wasmPath, witnessFile);
            logger.info('✅ Witness generated successfully');
        } catch (error) {
            handleError(error, 'Calculating witness', { wasmPath, witnessFile });
        }

        return 'Witness generated successfully';
    } catch (error) {
        handleError(error, step);
    }
};

/**
 * Generate proof (Groth16, PLONK, or FFLONK)
 */
const generateProof = async (witnessFileName, zkeyFileName, protocol = 'groth16') => {
    const step = 'Proof Generation';
    try {
        const witnessDir = path.join(__dirname, '../../Project_v1/ZKPFiles');
        const tauDir = path.join(__dirname, '../../Project_v1/tau_files');
        const witnessFile = path.join(witnessDir, witnessFileName);
        const fZkey = path.join(tauDir, zkeyFileName);

        let proofData;
        try {
            if (protocol === 'plonk') proofData = await snarkjs.plonk.prove(fZkey, witnessFile);
            else if (protocol === 'fflonk') proofData = await snarkjs.fflonk.prove(fZkey, witnessFile);
            else if (protocol === 'groth16') proofData = await snarkjs.groth16.prove(fZkey, witnessFile);
            else throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid protocol specified');
        } catch (error) {
            handleError(error, 'Generating proof', { fZkey, witnessFile, protocol });
        }

        const proofsDir = path.join(__dirname, '../../proofs');
        if (!fs.existsSync(proofsDir)) fs.mkdirSync(proofsDir, { recursive: true });

        const proofFile = path.join(proofsDir, `${protocol}_proof.json`);
        const publicFile = path.join(proofsDir, `${protocol}_public.json`);
        fs.writeFileSync(proofFile, JSON.stringify(proofData.proof, null, 2));
        fs.writeFileSync(publicFile, JSON.stringify(proofData.publicSignals, null, 2));

        logger.info('✅ Proof generated successfully', { proofFile, publicFile });
        return { proof: proofData.proof, publicSignals: proofData.publicSignals };
    } catch (error) {
        handleError(error, step);
    }
};

/**
 * Verify proof
 */
const verifyProof = async (vKeyJson, publicSignals, proof, protocol = 'groth16') => {
    const step = 'Proof Verification';
    try {
        let verified;
        try {
            if (protocol === 'plonk') verified = await snarkjs.plonk.verify(vKeyJson, publicSignals, proof);
            else if (protocol === 'fflonk') verified = await snarkjs.fflonk.verify(vKeyJson, publicSignals, proof);
            else if (protocol === 'groth16') verified = await snarkjs.groth16.verify(vKeyJson, publicSignals, proof);
            else throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid protocol specified');
        } catch (error) {
            handleError(error, 'Verifying proof', { protocol, publicSignals, proofSample: JSON.stringify(proof).slice(0, 200) });
        }

        logger.info('✅ Proof verification result:', { verified });
        return verified;
    } catch (error) {
        handleError(error, step);
    }
};

module.exports = {
    ceremony,
    InitialKeyGeneration,
    generateVKey,
    generateWitness,
    generateProof,
    verifyProof,
};