const express = require('express');
const validate = require('../../middlewares/validate');
const credentialController = require('../../controllers/credentials.controller');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });




const router = express.Router();

router.get('/createCredentialHash', credentialController.createCredentialHash);
router.post('/signCredentialHash', credentialController.signCredentialHash);
router.post('/verifyCredentialHash', upload.single('file'), credentialController.verifyCredentialHash);

module.exports = router;



/**
 * @swagger
 * tags:
 *   name: ZKP Credential
 *   description: Endpoints for generating credential hashes using Poseidon
 */

/**
 * @swagger
 * /credentials/createCredentialHash:
 *   get:
 *     summary: Generate a Poseidon credential hash
 *     description: |
 *       Generates a hash for a given user and issuer using the Poseidon hash function.
 *       Default values: user = 'user123', issuer = 'issuer456'.
 *     tags: [ZKP Credential]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           default: 123456789
 *         description: User ID for the credential
 *       - in: query
 *         name: issuerId
 *         schema:
 *           type: string
 *           default: 345678912
 *         description: Issuer ID for the credential
 *     responses:
 *       "200":
 *         description: Credential hash generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 hash:
 *                   type: string
 *                   example: "1234567890abcdef"
 *       "400":
 *         description: Bad request or missing parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Missing userId or issuerId"
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "500":
 *         description: Internal server error while generating credential hash
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to create credential hash. See logs for details"
 */


/**
 * @swagger
 * /credentials/signCredentialHash:
 *   post:
 *     summary: Sign a credential hash using the active key
 *     description: |
 *       Signs a credential hash using the active Ed25519 key from the key management system.
 *       The hash is signed and returned with signature details.
 *       
 *       🔢 Operator meaning:
 *       - 0 → Equal To (==)
 *       - 1 → Greater Than (>)
 *       - 2 → Less Than (<)
 *       
 *       📌 Example:
 *       - claimValue = 25 (user age)
 *       - requiredValue = 18
 *       - operator = 1 → checks if 25 > 18 ✅
 *       
 *     tags: [ZKP Credential]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: claimValue
 *         schema:
 *           type: string
 *           example: "25"
 *         description: Value of the claim (e.g., user age)
 *       - in: query
 *         name: requiredValue
 *         schema:
 *           type: string
 *           example: "18"
 *         description: Required threshold value
 *       - in: query
 *         name: operator
 *         schema:
 *           type: string
 *           example: "1"
 *         description: |
 *           Comparison operator:
 *           0 = Equal To (==),
 *           1 = Greater Than (>),
 *           2 = Less Than (<)
 *       - in: query
 *         name: download
 *         schema:
 *           type: boolean
 *           example: true
 *         description: Set to true to download the ZKP input JSON file
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - credentialHash
 *               - userId
 *               - issuerId
 *             properties:
 *               credentialHash:
 *                 type: string
 *                 description: The hash to sign (from createCredentialHash endpoint)
 *                 example: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
 *               userId:
 *                 type: string
 *                 description: User ID associated with the credential
 *                 example: "123456789"
 *               issuerId:
 *                 type: string
 *                 description: Issuer ID associated with the credential
 *                 example: "345678912"
 *     responses:
 *       "200":
 *         description: Credential hash signed successfully (JSON response or downloadable file)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     userID:
 *                       type: string
 *                       example: "123456789"
 *                     issuerID:
 *                       type: string
 *                       example: "345678912"
 *                     credentialHash:
 *                       type: string
 *                       example: "1234567890abcdef..."
 *                     claimValue:
 *                       type: string
 *                       example: "25"
 *                     requiredValue:
 *                       type: string
 *                       example: "18"
 *                     operator:
 *                       type: string
 *                       example: "1"
 *                     signatureR8x:
 *                       type: string
 *                       example: "451a52ca..."
 *                     signatureR8y:
 *                       type: string
 *                       example: "0"
 *                     signatureS:
 *                       type: string
 *                       example: "72972999..."
 *                     issuerPublicKeyX:
 *                       type: string
 *                       example: "93292a24..."
 *                     issuerPublicKeyY:
 *                       type: string
 *                       example: "0"
 *       "400":
 *         description: Bad request - missing required parameters
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "500":
 *         description: Internal server error while signing credential hash
 */


/**
 * @swagger
 * /credentials/verifyCredentialHash:
 *   post:
 *     summary: Verify a signed credential using uploaded JSON file
 *     description: |
 *       Upload a JSON file containing credential data and signature.
 *       The system will extract the credential hash, signature, and public key,
 *       and verify the Ed25519 signature.
 *
 *       ✅ Operator values:
 *       - 0 → Equal to
 *       - 1 → Greater than
 *       - 2 → Less than
 *
 *       📌 Example:
 *       - claimValue = 25
 *       - requiredValue = 18
 *       - operator = 1 → (25 > 18 ✅)
 *
 *     tags: [ZKP Credential]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Upload JSON file containing credential and signature data
 *
 *     responses:
 *       "200":
 *         description: Verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 isValid:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "✅ Signature valid"
 *                 input:
 *                   type: object
 *                   description: The uploaded JSON content used for verification
 *                   example:
 *                     userID: "123456789"
 *                     issuerID: "345678912"
 *                     credentialHash: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
 *                     claimValue: "25"
 *                     requiredValue: "18"
 *                     operator: "1"
 *                     signatureR8x: "451a52ca373adc1596ddb9b457f490ef35a2ee9368ebe0a849af1bd900009917"
 *                     signatureR8y: "0"
 *                     signatureS: "72972999d0600f0f72a11b6c6e66eda0d49082c24f2093dcd913376fae5fd601"
 *                     issuerPublicKeyX: "93292a2428040b625f7166d124730b6ba4d531a0766c04d361d620bc32f67d41"
 *                     issuerPublicKeyY: "0"
 *
 *       "400":
 *         description: Bad request - missing file or invalid JSON
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "No file uploaded or invalid JSON"
 *
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *
 *       "500":
 *         description: Internal server error during verification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Verification failed"
 */