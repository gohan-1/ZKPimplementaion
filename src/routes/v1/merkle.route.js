const express = require('express');
const router = express.Router();
const merkleController = require('../../controllers/merkle.controller');




router.get(
    '/proof/:userID/:issuerID',
    merkleController.getProofForVerification
);

router.get(
    '/current-root',
    merkleController.getCurrentRoot
);



router.post(
    '/rebuild',
    merkleController.rebuildTree
);

router.post(
    '/submit-root/:version',
    merkleController.submitRootToChain
);

router.get(
    '/submission-status/:txHash',
    merkleController.getSubmissionStatus
);

router.get(
    '/sync-roots',
    merkleController.syncRootsFromChain
);

router.get(
    '/root/:version',
    merkleController.getRootByVersion
);



module.exports = router;

/**
 * @swagger
 * tags:
 *   name: MerkleTree
 *   description: Merkle tree operations for ZKP proof management
 */

/**
 * @swagger
 * /merkle/proof/{userID}/{issuerID}:
 *   get:
 *     summary: Get Merkle proof by user and issuer
 *     tags: [MerkleTree]
 *     parameters:
 *       - in: path
 *         name: userID
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *       - in: path
 *         name: issuerID
 *         required: true
 *         schema:
 *           type: integer
 *         description: Issuer ID
 *     responses:
 *       200:
 *         description: Proof retrieved successfully
 *       404:
 *         description: Proof not found
 */