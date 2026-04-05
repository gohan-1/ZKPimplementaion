
const express = require('express');
const router = express.Router();
const merkleController = require('../../controllers/merkle.controller');

// ── Add leaves ───────────────────────────────────────────────────────────────
router.post('/add-proof', merkleController.addProofToTree);      // raw Groth16 proof
router.post('/add-proof-hash', merkleController.addProofHashToTree);  // pre-hashed bytes32

// ── Verify ───────────────────────────────────────────────────────────────────
router.post('/verify/by-proof-hash', merkleController.verifyByProofHash); // DB-assisted
router.post('/verify/by-raw-proof', merkleController.verifyByRawProof);  // DB-assisted
router.post('/verify/with-path', merkleController.verifyWithPath);    // trustless / no DB

// ── Hash utility ─────────────────────────────────────────────────────────────
router.post('/hash-proof', merkleController.hashProof);

// ── Query ─────────────────────────────────────────────────────────────────────
router.get('/current-root', merkleController.getCurrentRoot);
router.get('/stats', merkleController.getTreeStats);
router.get('/leaves', merkleController.getAllLeaves);         // ?page=1&limit=50
router.get('/proofs', merkleController.getAllProofs);         // ?page=1&limit=10
router.get('/proof/:proofHash', merkleController.getProofByHash);
router.get('/checkpoint/:version', merkleController.getCheckpoint);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.post('/rebuild', merkleController.rebuildTree);

// ── On-chain (FUTURE — routes registered, return 501 until enabled) ───────────
router.post('/chain/submit/:version', merkleController.submitRootToChain);
router.get('/chain/root/:version', merkleController.getRootFromChain);
router.get('/chain/status', merkleController.getChainStatus);

module.exports = router;


// ─────────────────────────────────────────────────────────────────────────────
// SWAGGER DOCS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * tags:
 *   name: MerkleTree
 *   description: |
 *     Incremental Merkle Tree (IMT) with Poseidon hash.
 *     Insert cost is O(depth=20) regardless of total leaf count.
 *     Hash function matches Groth16/snarkjs ZK circuits.
 */

/**
 * @swagger
 * /merkle/add-proof:
 *   post:
 *     summary: Add a raw Groth16 proof to the tree
 *     tags: [MerkleTree]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proof]
 *             properties:
 *               proof:
 *                 type: object
 *                 description: Groth16 proof with pi_a, pi_b, pi_c, protocol, curve
 *     responses:
 *       200:
 *         description: |
 *           Returns proofHash, leafIndex, merkleProof (save this!), root, version, leafCount.
 *           The merkleProof object contains siblings[] and pathIndices[] needed for trustless verification.
 *       409:
 *         description: Proof hash already exists in tree
 */

/**
 * @swagger
 * /merkle/add-proof-hash:
 *   post:
 *     summary: Add a pre-computed proof hash (bytes32) to the tree
 *     tags: [MerkleTree]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proofHash]
 *             properties:
 *               proofHash:
 *                 type: string
 *                 example: "0xabc123..."
 *     responses:
 *       200:
 *         description: Leaf added, returns merkleProof path
 *       409:
 *         description: Duplicate
 */

/**
 * @swagger
 * /merkle/verify/by-proof-hash:
 *   post:
 *     summary: Verify a leaf by proof hash (DB-assisted, Poseidon path recompute)
 *     description: |
 *       Loads stored sibling path from DB, recomputes Merkle root using Poseidon,
 *       and checks against the current in-memory root or a provided root.
 *
 *       Set expectedRoot to "onchain" to use the on-chain root [FUTURE].
 *     tags: [MerkleTree]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proofHash]
 *             properties:
 *               proofHash:
 *                 type: string
 *               expectedRoot:
 *                 type: string
 *                 description: Optional. Hex root or "onchain" [FUTURE]
 *     responses:
 *       200:
 *         description: "{ valid, computedRoot, trustedRoot, leafIndex, version, timestamp, rootSource }"
 */

/**
 * @swagger
 * /merkle/verify/by-raw-proof:
 *   post:
 *     summary: Verify from raw Groth16 proof object (DB-assisted)
 *     tags: [MerkleTree]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proof]
 *             properties:
 *               proof:
 *                 type: object
 *               expectedRoot:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verification result including computed proofHash
 */

/**
 * @swagger
 * /merkle/verify/with-path:
 *   post:
 *     summary: Trustless verification — caller supplies full Merkle path (no DB)
 *     description: |
 *       Pure cryptographic check using Poseidon.
 *       No database lookup. Works even if the server DB is wiped.
 *       Caller must have saved the merkleProof object returned at insertion time.
 *     tags: [MerkleTree]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proofHash, merkleProof, root]
 *             properties:
 *               proofHash:   { type: string }
 *               merkleProof:
 *                 type: object
 *                 properties:
 *                   siblings:    { type: array, items: { type: string } }
 *                   pathIndices: { type: array, items: { type: integer } }
 *               root:        { type: string }
 *     responses:
 *       200:
 *         description: "{ valid, computedRoot, rootToVerify, pathValid, rootMatches }"
 */

/**
 * @swagger
 * /merkle/hash-proof:
 *   post:
 *     summary: Compute keccak256 hash of a Groth16 proof (no insertion)
 *     tags: [MerkleTree]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proof]
 *             properties:
 *               proof: { type: object }
 *     responses:
 *       200:
 *         description: "{ proofHash }"
 */

/**
 * @swagger
 * /merkle/current-root:
 *   get:
 *     summary: Get current Merkle root
 *     tags: [MerkleTree]
 *     responses:
 *       200:
 *         description: "{ root, version, leafCount }"
 */

/**
 * @swagger
 * /merkle/stats:
 *   get:
 *     summary: Get full tree statistics
 *     tags: [MerkleTree]
 *     responses:
 *       200:
 *         description: "{ root, version, leafCount, treeDepth, maxLeaves, hashFunction, checkpoints, onchainEnabled }"
 */

/**
 * @swagger
 * /merkle/checkpoint/{version}:
 *   get:
 *     summary: Get IMT checkpoint summary for a specific version
 *     description: |
 *       Checkpoints are saved every 100 inserts.
 *       They store the O(depth) IMT internal state (not all leaves)
 *       so restarts are fast without replaying everything.
 *     tags: [MerkleTree]
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Checkpoint summary
 *       404:
 *         description: No checkpoint for that version
 */

/**
 * @swagger
 * /merkle/rebuild:
 *   post:
 *     summary: Rebuild IMT from VerifiedProof collection (admin / disaster recovery)
 *     description: |
 *       Cost is O(N × depth). Only use when tree state is corrupted or after migration.
 *     tags: [MerkleTree]
 *     responses:
 *       200:
 *         description: Tree rebuilt
 */

/**
 * @swagger
 * /merkle/chain/submit/{version}:
 *   post:
 *     summary: "[FUTURE] Submit Merkle root for a version to the smart contract"
 *     tags: [MerkleTree]
 *     responses:
 *       501:
 *         description: Not yet enabled
 */

/**
 * @swagger
 * /merkle/chain/root/{version}:
 *   get:
 *     summary: "[FUTURE] Get Merkle root for a version from the smart contract"
 *     tags: [MerkleTree]
 *     responses:
 *       501:
 *         description: Not yet enabled
 */

/**
 * @swagger
 * /merkle/chain/status:
 *   get:
 *     summary: "[FUTURE] List all tree versions that have been anchored on-chain"
 *     tags: [MerkleTree]
 *     responses:
 *       200:
 *         description: List of submitted roots + onchainEnabled flag
 */