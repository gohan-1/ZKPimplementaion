// controllers/merkle.controller.js
'use strict';

const merkleService = require('../services/merkle.service');
const ZKPProofHasher = require('../utils/zkpHash');
const TreeState = require('../models/treeState.model');

// ─── Response helpers ────────────────────────────────────────────────────────

const ok = (res, data, msg = 'Success') =>
    res.json({ success: true, message: msg, data });

const err = (res, e, status = 500) =>
    res.status(status).json({ success: false, message: e.message || String(e) });

const bad = (res, msg) =>
    res.status(400).json({ success: false, message: msg });

// ─────────────────────────────────────────────────────────────────────────────
// ADD ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /merkle/add-proof
 * Body: { proof: <Groth16 object> }
 *
 * Hashes the proof with keccak256, inserts it as a leaf in the IMT.
 * Returns the Merkle proof path — save this, it's what the user needs to verify.
 */
const addProofToTree = async (req, res) => {
    try {
        const { proof } = req.body;
        if (!proof) return bad(res, 'Missing required field: proof');

        const result = await merkleService.addZKPProof(proof);
        return ok(res, result, 'ZKP proof added to Merkle tree');
    } catch (e) {
        if (e.message.startsWith('Duplicate')) return res.status(409).json({ success: false, message: e.message });
        return err(res, e);
    }
};

/**
 * POST /merkle/add-proof-hash
 * Body: { proofHash: "0x..." }
 *
 * Insert a pre-computed keccak256 bytes32 hash directly as a leaf.
 */
const addProofHashToTree = async (req, res) => {
    try {
        const { proofHash } = req.body;
        if (!proofHash) return bad(res, 'Missing required field: proofHash');
        if (!/^0x[0-9a-fA-F]{64}$/.test(proofHash))
            return bad(res, 'proofHash must be a 0x-prefixed 32-byte hex string');

        const result = await merkleService.addProofHash(proofHash);
        return ok(res, result, 'Proof hash added to Merkle tree');
    } catch (e) {
        if (e.message.startsWith('Duplicate')) return res.status(409).json({ success: false, message: e.message });
        return err(res, e);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /merkle/verify/by-proof-hash
 * Body: { proofHash: "0x...", expectedRoot?: "0x..." | "onchain" }
 *
 * DB-assisted verification.
 * Loads stored sibling path from DB, recomputes root with Poseidon,
 * compares against expectedRoot (or current in-memory root if omitted).
 *
 * Pass expectedRoot: "onchain" to use the on-chain root [FUTURE].
 *
 * Response:
 *   { valid, computedRoot, trustedRoot, leafIndex, version, timestamp, rootSource }
 */
const verifyByProofHash = async (req, res) => {
    try {

        const { proofHash } = req.body;
        if (!proofHash) return bad(res, 'Missing required field: proofHash');

        const result = await merkleService.verifyByProofHash(proofHash);
        const msg = result.valid ? '✅ Leaf is valid in tree' : '❌ Leaf NOT found in tree';
        return ok(res, result, msg);
    } catch (e) {
        return err(res, e);
    }
};

/**
 * POST /merkle/verify/by-raw-proof
 * Body: { proof: <Groth16 object>, expectedRoot?: "0x..." | "onchain" }
 *
 * Hashes the proof first, then verifies. Convenient when caller has the
 * original proof object but not the hash.
 */
const verifyByRawProof = async (req, res) => {
    try {
        const { proof } = req.body;
        if (!proof) return bad(res, 'Missing required field: proof');

        const result = await merkleService.verifyByRawProof(proof);
        const msg = result.valid ? '✅ Proof is valid in tree' : '❌ Proof NOT found in tree';
        return ok(res, result, msg);
    } catch (e) {
        return err(res, e);
    }
};

/**
 * POST /merkle/verify/with-path
 * Body: { proofHash, merkleProof: { siblings, pathIndices }, root }
 *
 * TRUSTLESS verification — no DB lookup.
 * The caller supplies everything from the insertion response they saved.
 * Works even if the server's DB is wiped, as long as the on-chain root exists.
 *
 * Response: { valid, computedRoot, rootToVerify, pathValid, rootMatches }
 */
const verifyWithPath = async (req, res) => {
    try {
        const { proofHash, merkleProof, root } = req.body;
        if (!proofHash || !merkleProof || !root)
            return bad(res, 'Missing required fields: proofHash, merkleProof, root');
        if (!merkleProof.siblings || !merkleProof.pathIndices)
            return bad(res, 'merkleProof must contain siblings[] and pathIndices[]');

        const result = merkleService.verifyWithPath(proofHash, merkleProof, root);
        const msg = result.valid ? '✅ Path verifies correctly' : '❌ Path does not verify';
        return ok(res, result, msg);
    } catch (e) {
        return err(res, e);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// HASH UTILITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /merkle/hash-proof
 * Body: { proof: <Groth16 object> }
 *
 * Compute the deterministic keccak256 hash of a proof without inserting it.
 * Useful to check if a proof is already in the tree before submitting.
 */
const hashProof = async (req, res) => {
    try {
        const { proof } = req.body;
        if (!proof) return bad(res, 'Missing required field: proof');

        const proofHash = ZKPProofHasher.hashFullProof(proof);
        return ok(res, { proofHash }, 'Proof hashed successfully');
    } catch (e) {
        return err(res, e);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// QUERY ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

const getCurrentRoot = async (req, res) => {
    try { return ok(res, await merkleService.getCurrentRoot()); }
    catch (e) { return err(res, e); }
};

const getTreeStats = async (req, res) => {
    try { return ok(res, await merkleService.getTreeStats()); }
    catch (e) { return err(res, e); }
};

const getAllLeaves = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(500, parseInt(req.query.limit) || 50);
        return ok(res, await merkleService.getAllLeaves(page, limit));
    } catch (e) { return err(res, e); }
};

const getAllProofs = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 10);
        return ok(res, await merkleService.getAllProofs(page, limit));
    } catch (e) { return err(res, e); }
};

const getProofByHash = async (req, res) => {
    try {
        return ok(res, await merkleService.getProofByHash(req.params.proofHash));
    } catch (e) {
        if (e.message.includes('not found')) return err(res, e, 404);
        return err(res, e);
    }
};

/**
 * GET /merkle/checkpoint/:version
 * Returns the saved TreeState checkpoint for a specific version.
 * Useful for debugging / auditing the tree state at a given point in time.
 */
const getCheckpoint = async (req, res) => {
    try {
        const version = parseInt(req.params.version);
        const snapshot = await TreeState.findOne({ version });
        if (!snapshot) return err(res, new Error(`No checkpoint for version ${version}`), 404);

        // Don't send the full node map (can be large) — send summary only
        return ok(res, {
            version: snapshot.version,
            root: snapshot.root,
            leafCount: snapshot.leafCount,
            depth: snapshot.depth,
            nodeCount: snapshot.nodes.length,
            isRebuild: snapshot.isRebuild,
            savedAt: snapshot.savedAt,
            // On-chain info (FUTURE)
            submittedToChain: snapshot.submittedToChain,
            txHash: snapshot.txHash,
            chainName: snapshot.chainName,
            submittedAt: snapshot.submittedAt
        });
    } catch (e) { return err(res, e); }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /merkle/rebuild
 * Wipes in-memory IMT and rebuilds from VerifiedProof collection.
 * Use for disaster recovery or after manual DB edits.
 * Cost: O(N × depth) — slow for large trees.
 */
const rebuildTree = async (req, res) => {
    try {
        const result = await merkleService.rebuildFromDatabase();
        return ok(res, result, 'Merkle tree rebuilt from database');
    } catch (e) { return err(res, e); }
};

// ─────────────────────────────────────────────────────────────────────────────
// ON-CHAIN STUBS (FUTURE — routes registered but return 501 until enabled)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /merkle/chain/submit/:version
 * [FUTURE] Submit the root for a specific version to the smart contract.
 */
const submitRootToChain = async (req, res) => {
    // When ready: enable ONCHAIN_ENABLED in service and implement _submitRootToChain
    return res.status(501).json({
        success: false,
        message: 'On-chain submission not yet enabled. Set ONCHAIN_ENABLED=true in service and deploy contract.',
        hint: 'See _submitRootToChain() in merkleTree.service.js for the implementation stub.'
    });
};

/**
 * GET /merkle/chain/root/:version
 * [FUTURE] Fetch the root for a version from the smart contract.
 */
const getRootFromChain = async (req, res) => {
    return res.status(501).json({
        success: false,
        message: 'On-chain root fetch not yet enabled.',
        hint: 'See _getRootFromChain() in merkleTree.service.js for the implementation stub.'
    });
};

/**
 * GET /merkle/chain/status
 * [FUTURE] Check which tree versions have been anchored on-chain.
 */
const getChainStatus = async (req, res) => {
    try {
        const submitted = await TreeState.find({ submittedToChain: true })
            .select('version root txHash chainName submittedAt')
            .sort({ version: -1 })
            .limit(20);

        return ok(res, {
            onchainEnabled: false, // flip to true once contract is deployed
            submitted,
            hint: 'Enable ONCHAIN_ENABLED in service to start anchoring roots.'
        });
    } catch (e) { return err(res, e); }
};

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    // add
    addProofToTree,
    addProofHashToTree,
    // verify
    verifyByProofHash,
    verifyByRawProof,
    verifyWithPath,
    // util
    hashProof,
    // query
    getCurrentRoot,
    getTreeStats,
    getAllLeaves,
    getAllProofs,
    getProofByHash,
    getCheckpoint,
    // admin
    rebuildTree,
    // on-chain stubs (FUTURE)
    submitRootToChain,
    getRootFromChain,
    getChainStatus
};