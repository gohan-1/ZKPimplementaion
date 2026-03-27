const express = require('express');
const validate = require('../../middlewares/validate');
const zkpFileController = require('../../controllers/zkpFile.controller');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });




const router = express.Router();

router.get('/crearteCeremony', zkpFileController.crearteCeremony);
router.get('/createInitialKey', zkpFileController.InitialKeyGeneration);
router.get('/verifierKey', zkpFileController.generateVeriferKey);
router.post('/createWitness', upload.single('file'), zkpFileController.createWitness);
router.post('/generateProof',
    upload.single('witness'), zkpFileController.createProof);          // Generate Groth16/PLONK proof
router.post('/verifyProof',
    upload.fields([
        { name: 'vkey', maxCount: 1 },
        { name: 'proof', maxCount: 1 },
        { name: 'public', maxCount: 1 }
    ]), zkpFileController.verifyProofController);


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

/**
 * @swagger
 * /zkp-file-generation/createWitness:
 *   post:
 *     summary: Generate a zk-SNARK witness from uploaded JSON
 *     description: |
 *       Reads a JSON file uploaded by the user and generates a witness file (`witness.wtns`) using the specified ZKP circuit (.wasm file).
 *       The uploaded JSON must contain valid input values for the circuit.
 *     tags: [ZKP Ceremony]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: zkpCircuit
 *         schema:
 *           type: string
 *           enum:
 *             - zkpCircuit.wasm
 *           default: zkpCircuit.wasm
 *         required: true
 *         description: Name of the ZKP circuit (.wasm file) to use for witness generation
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: JSON file containing input values for the circuit
 *     responses:
 *       "201":
 *         description: Witness generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Witness generated successfully
 *       "400":
 *         description: Bad request (missing file or invalid JSON)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: No file uploaded / Invalid JSON file
 *                 error:
 *                   type: string
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "500":
 *         description: Internal server error during witness generation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Witness Generation failed. See logs for details
 */

/**
 * @swagger
 * /zkp-file-generation/generateProof:
 *   post:
 *     summary: Generate zk-SNARK Proof (Groth16 / PLONK / FFLONK)
 *     description: |
 *       Generates a proof using a witness file and a selected zKey.
 *       The witness is uploaded as a file, while the zKey is selected via query parameter.
 *     tags: [ZKP Ceremony]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: zkey
 *         schema:
 *           type: string
 *           enum:
 *             - final.zkey
 *           default: final.zkey
 *         required: true
 *         description: Select the final zKey file
 *       - in: query
 *         name: protocol
 *         schema:
 *           type: string
 *           enum:
 *             - groth16
 *             - plonk
 *             - fflonk
 *           default: groth16
 *         required: false
 *         description: zk-SNARK protocol to use
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               witness:
 *                 type: string
 *                 format: binary
 *                 description: Witness file (.wtns)
 *     responses:
 *       "201":
 *         description: Proof generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Proof generated successfully
 *                 proof:
 *                   type: object
 *                   description: Generated proof object
 *                 publicSignals:
 *                   type: array
 *                   items:
 *                     type: string
 *       "400":
 *         description: Bad request (missing file or invalid parameters)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: witness file is required
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "500":
 *         description: Internal server error during proof generation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Proof Generation failed. See logs for details
 */

/**
 * @swagger
 * /zkp-file-generation/verifyProof:
 *   post:
 *     summary: Verify zk-SNARK Proof (Groth16 / PLONK / FFLONK)
 *     description: |
 *       Verifies a zk-SNARK proof using uploaded verification key, proof, and public signals files.
 *       All inputs must be provided as JSON files.
 *     tags: [ZKP Ceremony]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: protocol
 *         schema:
 *           type: string
 *           enum:
 *             - groth16
 *             - plonk
 *             - fflonk
 *           default: groth16
 *         required: false
 *         description: zk-SNARK protocol to use
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               vkey:
 *                 type: string
 *                 format: binary
 *                 description: Verification key JSON file
 *               proof:
 *                 type: string
 *                 format: binary
 *                 description: Proof JSON file
 *               public:
 *                 type: string
 *                 format: binary
 *                 description: Public signals JSON file
 *             required:
 *               - vkey
 *               - proof
 *               - public
 *     responses:
 *       "200":
 *         description: Proof verification completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Proof verification completed
 *                 verified:
 *                   type: boolean
 *                   example: true
 *       "400":
 *         description: Bad request (missing files or invalid JSON)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid JSON file(s)
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "500":
 *         description: Internal server error during verification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Proof Verification failed. See logs for details
 */