const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const logger = require('../config/logger');
const { zkpFileService } = require('../services');
const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const { log } = require('console');


const crearteCeremony = catchAsync(async (req, res) => {
    try {
        logger.info('🔹 Starting Ceremony...');
        const result = await zkpFileService.ceremony();
        res.status(httpStatus.CREATED).send(result);
    } catch (error) {
        logger.error({ error }, '❌ Ceremony failed');
        throw error;
    }
});

const InitialKeyGeneration = catchAsync(async (req, res) => {
    try {
        const { circuitName, finalKey } = req.query;

        logger.info({ circuitName, finalKey }, '🔹 Initial Key Generation request');

        if (!circuitName || !finalKey) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'circuitName and finalKey are required');
        }

        const result = await zkpFileService.InitialKeyGeneration(circuitName, finalKey);
        res.status(httpStatus.CREATED).send(result);

    } catch (error) {
        logger.error({ error, query: req.query }, '❌ Initial Key Generation failed');
        throw error;
    }
});

const generateVeriferKey = catchAsync(async (req, res) => {
    try {
        const { finalKey } = req.query;

        logger.info({ finalKey }, '🔹 Generate Verification Key request');

        if (!finalKey) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'finalKey is required');
        }

        const result = await zkpFileService.generateVKey(finalKey);
        res.status(httpStatus.CREATED).send(result);

    } catch (error) {
        logger.error({ error, query: req.query }, '❌ Verification Key Generation failed');
        throw error;
    }
});

const createWitness = catchAsync(async (req, res) => {
    try {


        if (!req.file) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded');
        }

        const fileName = req.query.zkpCircuit;
        if (!fileName) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'zkpCircuit is required');
        }

        let inputJson;
        try {
            const fileContent = req.file.buffer.toString('utf-8');
            inputJson = JSON.parse(fileContent);
        } catch (err) {
            logger.error({ err }, '❌ Invalid JSON in uploaded file');
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid JSON file');
        }

        const result = await zkpFileService.generateWitness(inputJson, fileName);

        res.status(httpStatus.CREATED).send(result);

    } catch (error) {
        logger.info(error)
        logger.error({ error }, '❌ Witness generation failed');
        throw error;
    }
});

const createProof = catchAsync(async (req, res) => {
    const protocol = req.query.protocol || 'groth16';
    const zkeyFileName = req.query.zkey;
    const witnessPath = '/temp_witness.wtns';

    try {
        logger.info({ protocol, zkeyFileName }, '🔹 Create Proof request');

        if (!zkeyFileName) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'zkey is required');
        }

        if (!req.file) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'witness file is required');
        }

        // Save temp witness
        const witnessDir = path.join(__dirname, '../../Project_v1/ZKPFiles');

        const witnessFile = path.join(witnessDir, witnessPath);
        fs.writeFileSync(witnessFile, req.file.buffer);

        const result = await zkpFileService.generateProof(
            'temp_witness.wtns',
            zkeyFileName,
            protocol
        );

        res.status(httpStatus.CREATED).json({
            message: 'Proof generated successfully',
            ...result
        });

    } catch (error) {
        logger.error(
            { error, protocol, zkeyFileName },
            '❌ Proof generation failed'
        );
        throw error;

    } finally {
        // ✅ Always cleanup
        if (fs.existsSync(witnessPath)) {
            fs.unlinkSync(witnessPath);
            logger.info('🧹 Temp witness file cleaned');
        }
    }
});

const verifyProofController = catchAsync(async (req, res) => {
    const protocol = req.query.protocol || 'groth16';

    try {
        logger.info({ protocol }, '🔹 Verify Proof request');

        if (!req.files || !req.files.vkey || !req.files.proof || !req.files.public) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                'vkey, proof, and public files are required'
            );
        }

        let vKeyJson, proofJson, publicSignals;

        try {
            vKeyJson = JSON.parse(req.files.vkey[0].buffer.toString());
            proofJson = JSON.parse(req.files.proof[0].buffer.toString());
            publicSignals = JSON.parse(req.files.public[0].buffer.toString());
        } catch (err) {
            logger.error({ err }, '❌ Invalid JSON in uploaded files');
            throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid JSON file(s)');
        }

        const verified = await zkpFileService.verifyProof(
            vKeyJson,
            publicSignals,
            proofJson,
            protocol
        );

        res.status(httpStatus.OK).json({
            message: 'Proof verification completed',
            verified
        });

    } catch (error) {
        logger.error({ error, protocol }, '❌ Proof verification failed');
        throw error;
    }
});

module.exports = {
    crearteCeremony,
    InitialKeyGeneration,
    generateVeriferKey,
    createWitness,
    createProof,
    verifyProofController
}