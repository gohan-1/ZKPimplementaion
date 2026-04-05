// routes/merkle.routes.js
const express = require('express');
const router = express.Router();
const c = require('../../controllers/merkle.controller');

// ── Add leaves ──────────────────────────────────────────────────────────────
router.post('/add-proof', c.addProofToTree);       // raw Groth16 proof
router.post('/add-proof-hash', c.addProofHashToTree);   // pre-hashed bytes32

// ── Verify ──────────────────────────────────────────────────────────────────
router.post('/verify/by-proof-hash', c.verifyByProofHash); // DB-assisted
router.post('/verify/by-raw-proof', c.verifyByRawProof);  // DB-assisted
router.post('/verify/with-path', c.verifyWithPath);    // trustless / no DB

// ── Hash utility ─────────────────────────────────────────────────────────────
router.post('/hash-proof', c.hashProof);

// ── Query ────────────────────────────────────────────────────────────────────
router.get('/current-root', c.getCurrentRoot);
router.get('/stats', c.getTreeStats);
router.get('/leaves', c.getAllLeaves);          // ?page=1&limit=50
router.get('/proofs', c.getAllProofs);          // ?page=1&limit=10
router.get('/proof/:proofHash', c.getProofByHash);
router.get('/root/:version', c.getRootByVersion);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.post('/rebuild', c.rebuildTree);

module.exports = router;


// ─────────────────────────────────────────────────────────────────────────────
// SWAGGER DOCS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * tags:
 *   name: MerkleTree
 *   description: Merkle tree operations for ZKP proof management
 */

/**
 * @swagger
 * /merkle/add-proof:
 *   post:
 *     summary: Add a raw Groth16 proof to the Merkle tree
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
 *         description: Leaf added; returns leafIndex, leafHash, merkleProof, root, version
 *       409:
 *         description: Duplicate – proof hash already in tree
 */

/**
 * @swagger
 * /merkle/add-proof-hash:
 *   post:
 *     summary: Add a pre-computed proof hash (bytes32) to the Merkle tree
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
 *         description: Leaf added
 *       409:
 *         description: Duplicate
 */

/**
 * @swagger
 * /merkle/verify/by-proof-hash:
 *   post:
 *     summary: Verify a leaf by proof hash (DB-assisted)
 *     description: |
 *       Looks up stored Merkle path, recomputes root from leaf+path,
 *       and checks against current (or provided) root.
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
 *                 description: Optional – if omitted, current root is used
 *     responses:
 *       200:
 *         description: |
 *           { valid, computedRoot, storedRoot, leafIndex, leafHash, version, timestamp }
 */

/**
 * @swagger
 * /merkle/verify/by-raw-proof:
 *   post:
 *     summary: Verify a leaf from a raw Groth16 proof object (DB-assisted)
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
 *     summary: Trustless verification – caller supplies Merkle path (no DB lookup)
 *     tags: [MerkleTree]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proofHash, timestamp, merklePath, root]
 *             properties:
 *               proofHash:   { type: string }
 *               timestamp:   { type: string, description: "stored at insertion" }
 *               merklePath:  { type: array, items: { type: string } }
 *               root:        { type: string }
 *     responses:
 *       200:
 *         description: "{ valid, computedRoot, rootToVerify }"
 */

/**
 * @swagger
 * /merkle/hash-proof:
 *   post:
 *     summary: Compute deterministic keccak256 hash of a Groth16 proof (no insertion)
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
 *     summary: Get tree statistics
 *     tags: [MerkleTree]
 *     responses:
 *       200:
 *         description: "{ root, version, leafCount, zeroHash, lastUpdated }"
 */

/**
 * @swagger
 * /merkle/leaves:
 *   get:
 *     summary: Paginated list of all leaves
 *     tags: [MerkleTree]
 *     parameters:
 *       - { in: query, name: page,  schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: "{ leaves, total, page, limit, totalPages }"
 */

/**
 * @swagger
 * /merkle/proofs:
 *   get:
 *     summary: Paginated list of all verified proofs
 *     tags: [MerkleTree]
 *     responses:
 *       200:
 *         description: "{ proofs, pagination }"
 */

/**
 * @swagger
 * /merkle/proof/{proofHash}:
 *   get:
 *     summary: Get full proof record by hash
 *     tags: [MerkleTree]
 *     parameters:
 *       - { in: path, name: proofHash, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Full VerifiedProof record
 *       404:
 *         description: Not found
 */

/**
 * @swagger
 * /merkle/root/{version}:
 *   get:
 *     summary: Get tree root at a specific version
 *     tags: [MerkleTree]
 *     parameters:
 *       - { in: path, name: version, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Snapshot root info
 *       404:
 *         description: Version not found
 */

/**
 * @swagger
 * /merkle/rebuild:
 *   post:
 *     summary: Rebuild the in-memory tree from DB (admin)
 *     tags: [MerkleTree]
 *     responses:
 *       200:
 *         description: Tree rebuilt
 */