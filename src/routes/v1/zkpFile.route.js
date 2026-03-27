const express = require('express');
const validate = require('../../middlewares/validate');
const zkpFileController = require('../../controllers/zkpFile.controller');





const router = express.Router();

router.get('/crearteCeremony', zkpFileController.crearteCeremony);
router.get('/createInitialKey', zkpFileController.InitialKeyGeneration);
router.get('/verifierKey', zkpFileController.generateVeriferKey);

module.exports = router;


/**
 * @swagger
 * tags:
 *   name: ZKP Ceremony
 *   description: Endpoints for creating ZKP ceremony files (Powers of Tau, Phase 2, etc.)
 */

/**
 * @swagger
 * /zkp-file-generation/crearteCeremony:
 *   get:
 *     summary: Start a Trusted Setup Ceremony
 *     description: |
 *       Runs the ceremony to generate Powers of Tau and Phase 2 files. 
 *       This is a long-running operation that prepares the zk-SNARK trusted setup.
 *     tags: [ZKP Ceremony]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: Ceremony completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Trusted Setup Ceremony completed successfully
 *       "400":
 *         description: Bad request or invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid request parameters
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "500":
 *         description: Internal server error during ceremony
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Trusted Setup Ceremony failed. See logs for details
 */


/**
 * @swagger
 * /zkp-file-generation/createInitialKey:
 *   get:
 *     summary: Generate Initial zKey for zk-SNARKs
 *     description: |
 *       Generates the initial and final zKey for a zk-SNARK circuit.
 *       The request requires selecting a circuit file and a final ptau file from predefined options.
 *     tags: [ZKP Ceremony]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: circuitName
 *         schema:
 *           type: string
 *           enum: 
 *             - zkpCircuit.r1cs
 *           default: zkpCircuit.r1cs
 *         required: true
 *         description: Select the circuit file for the trusted setup
 *       - in: query
 *         name: finalKey
 *         schema:
 *           type: string
 *           enum:
 *             - pot12_final.ptau
 *           default: pot12_final.ptau
 *         required: true
 *         description: Select the final ptau file for the trusted setup
 *     responses:
 *       "201":
 *         description: Initial Key Generation completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Initial Key Generation completed successfully
 *       "400":
 *         description: Bad request or invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid request parameters
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "500":
 *         description: Internal server error during zKey generation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Initial Key Generation failed. See logs for details
 */


/**
 * @swagger
 * /zkp-file-generation/verifierKey:
 *   get:
 *     summary: Generate Verification Key
 *     description: |
 *       Generates a verification key JSON file from the final zKey.
 *       The request requires selecting the final zKey file from predefined options.
 *     tags: [ZKP Ceremony]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: finalKey
 *         schema:
 *           type: string
 *           enum:
 *             - final.zkey
 *           default: final.zkey
 *         required: true
 *         description: Select the final zKey file
 *     responses:
 *       "201":
 *         description: Verification Key generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Verification Key generated successfully
 *       "400":
 *         description: Bad request or invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid request parameters
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "500":
 *         description: Internal server error during verification key generation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Verification Key Generation failed. See logs for details
 */