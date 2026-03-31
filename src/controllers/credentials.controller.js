const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const logger = require('../config/logger');
const { credentialsService } = require('../services');

// Controller to create credential hash
const createCredentialHash = catchAsync(async (req, res) => {
    try {
        const { userId, issuerId } = req.query;  // or req.body
        if (!userId || !issuerId) {
            return res.status(400).send({ message: 'Missing userId or issuerId' });
        }

        const hash = await credentialsService.createCredentialHash(userId, issuerId);
        res.status(200).send({ hash });
    } catch (error) {
        logger.error({ error }, '❌ Failed to create credential hash');
        throw error;
    }
});

const signCredentialHash = catchAsync(async (req, res) => {
    try {
        const credential = req.body;

        const { credentialHash, issuerId, userId } = credential;

        // Optional query params
        const claimValue = req.query.claimValue || "0";
        const requiredValue = req.query.requiredValue || "0";
        const operator = req.query.operator || "0";

        // Download flag
        const download = req.query.download === "true";

        if (!credentialHash || !issuerId) {
            return res.status(400).send({ message: 'Missing credentialHash or issuerId' });
        }

        // Sign the hash
        const result = await credentialsService.signHash(credentialHash);

        // Build ZKP input JSON exactly as required
        const zkpInput = {
            userID: userId,
            issuerID: issuerId,
            credentialHash: credentialHash,

            claimValue: claimValue,
            requiredValue: requiredValue,
            operator: operator,

            signatureR8x: result.signature.r8x,
            signatureR8y: result.signature.r8y,
            signatureS: result.signature.s,

            issuerPublicKeyX: result.signature.publicKeyX,
            issuerPublicKeyY: result.signature.publicKeyY
        };

        // If download requested, send as attachment
        if (download) {
            res.setHeader('Content-Disposition', 'attachment; filename=zkp_input.json');
            res.setHeader('Content-Type', 'application/json');
            return res.status(200).send(JSON.stringify(zkpInput, null, 2));
        }

        // Otherwise, return JSON directly (no wrapping)
        return res.status(200).json(zkpInput);

    } catch (error) {
        logger.error({ error }, '❌ Failed to create credential hash');
        throw error;
    }
});

// const verifyCredentialHash = catchAsync(async (req, res) => {
//     try {
//         const { credentialHash, signature } = req.body;

//         if (!credentialHash || !signature) {
//             return res.status(400).send({
//                 success: false,
//                 message: 'Missing credentialHash or signature'
//             });
//         }

//         const result = await credentialsService.verifyHash(
//             credentialHash,
//             signature
//         );

//         res.status(200).send(result);

//     } catch (error) {
//         logger.error({ error }, '❌ Verification failed');
//         throw error;
//     }
// });


const verifyCredentialHash = catchAsync(async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send({
                success: false,
                message: 'No file uploaded'
            });
        }

        // ✅ Convert buffer → JSON
        let data;
        try {
            data = JSON.parse(req.file.buffer.toString());
        } catch (err) {
            return res.status(400).send({
                success: false,
                message: 'Invalid JSON file'
            });
        }

        // ✅ Validate required fields
        if (
            !data.credentialHash ||
            !data.signatureR8x ||
            !data.signatureS ||
            !data.issuerPublicKeyX
        ) {
            return res.status(400).send({
                success: false,
                message: 'Missing required fields in JSON'
            });
        }

        const result = await credentialsService.verifyHash(data);

        // ✅ Create sanitized response without signature fields
        const sanitizedResponse = {
            userID: data.userID,
            issuerID: data.issuerID,
            credentialHash: data.credentialHash,
            claimValue: data.claimValue,
            requiredValue: data.requiredValue,
            operator: data.operator
        };

        res.status(200).send({
            success: true,
            isValid: result.isValid,
            message: result.message,
            input: sanitizedResponse
        });


    } catch (error) {
        logger.error({ error }, '❌ Verification failed');
        throw error;
    }
});

module.exports = {
    createCredentialHash,
    signCredentialHash,
    verifyCredentialHash
};