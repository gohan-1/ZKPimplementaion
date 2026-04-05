// controllers/merkle.controller.js
const merkleService = require('../services/merkle.service');
const ZKPProofHasher = require('../utils/zkpHash');
const TreeSnapshot = require('../models/treeSnapshot.model');
const VerifiedProof = require('../models/VerifiedProof.model');

// ─── helpers ────────────────────────────────────────────────────────────────

const ok = (res, data, msg = 'Success') => res.json({ success: true, message: msg, data });
const err = (res, e, status = 500) => res.status(status).json({ success: false, message: e.message || e });
const bad = (res, msg) => res.status(400).json({ success: false, message: msg });

// ─── ADD ────────────────────────────────────────────────────────────────────

/**
 * POST /merkle/add-proof
 * Body: { proof: <Groth16 object> }
 *
 * Hashes the proof and adds it as a leaf.
 */
const addProofToTree = async (req, res) => {
    try {
        const { proof } = req.body;
        if (!proof) return bad(res, 'Missing required field: proof');

        const result = await merkleService.addZKPProof(proof);
        return ok(res, result, 'ZKP proof added to Merkle tree');
    } catch (e) {
        console.error('[addProofToTree]', e);
        // 409 if duplicate
        if (e.message.includes('already exists')) return res.status(409).json({ success: false, message: e.message });
        return err(res, e);
    }
};

/**
 * POST /merkle/add-proof-hash
 * Body: { proofHash: "0x..." }
 *
 * Adds a pre-computed bytes32 proof hash directly.
 */
const addProofHashToTree = async (req, res) => {
    try {
        const { proofHash } = req.body;
        if (!proofHash) return bad(res, 'Missing required field: proofHash');
        if (!/^0x[0-9a-fA-F]{64}$/.test(proofHash)) return bad(res, 'proofHash must be a 0x-prefixed 32-byte hex string');

        const result = await merkleService.addProofHash(proofHash);
        return ok(res, result, 'Proof hash added to Merkle tree');
    } catch (e) {
        if (e.message.includes('already exists')) return res.status(409).json({ success: false, message: e.message });
        return err(res, e);
    }
};

// ─── VERIFY ─────────────────────────────────────────────────────────────────

/**
 * POST /merkle/verify/by-proof-hash
 * Body: { proofHash: "0x...", expectedRoot?: "0x..." }
 *
 * Looks up the stored Merkle path for this proofHash, recomputes the root,
 * and returns whether the leaf belongs to the tree.
 */
const verifyByProofHash = async (req, res) => {
    try {
        const { proofHash, expectedRoot } = req.body;
        if (!proofHash) return bad(res, 'Missing required field: proofHash');

        const result = await merkleService.verifyByProofHash(proofHash, expectedRoot || null);
        return ok(res, result, result.valid ? '✅ Leaf is valid in tree' : '❌ Leaf is NOT in tree');
    } catch (e) {
        return err(res, e);
    }
};

/**
 * POST /merkle/verify/by-raw-proof
 * Body: { proof: <Groth16 object>, expectedRoot?: "0x..." }
 *
 * Hashes the proof first, then verifies as above.
 */
const verifyByRawProof = async (req, res) => {
    try {
        const { proof, expectedRoot } = req.body;
        if (!proof) return bad(res, 'Missing required field: proof');

        const result = await merkleService.verifyByRawProof(proof, expectedRoot || null);
        return ok(res, result, result.valid ? '✅ Proof is valid in tree' : '❌ Proof is NOT in tree');
    } catch (e) {
        return err(res, e);
    }
};

/**
 * POST /merkle/verify/with-path
 * Body: { proofHash, timestamp, merklePath: [...], root }
 *
 * Trustless verification — caller supplies the Merkle path themselves.
 * No DB lookup. Pure cryptographic check.
 */
const verifyWithPath = async (req, res) => {
    try {
        const { proofHash, timestamp, merklePath, root } = req.body;
        if (!proofHash || !timestamp || !merklePath || !root)
            return bad(res, 'Missing required fields: proofHash, timestamp, merklePath, root');

        const result = merkleService.verifyWithPath(proofHash, timestamp, merklePath, root);
        return ok(res, result, result.valid ? '✅ Path verifies correctly' : '❌ Path does not verify');
    } catch (e) {
        return err(res, e);
    }
};

// ─── HASH UTILITY ───────────────────────────────────────────────────────────

/**
 * POST /merkle/hash-proof
 * Body: { proof: <Groth16 object> }
 *
 * Returns the deterministic keccak256 hash of the proof without adding it to the tree.
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

// ─── QUERIES ────────────────────────────────────────────────────────────────

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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        return ok(res, await merkleService.getAllLeaves(page, limit));
    } catch (e) { return err(res, e); }
};

const getAllProofs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        return ok(res, await merkleService.getAllProofs(page, limit));
    } catch (e) { return err(res, e); }
};

const getProofByHash = async (req, res) => {
    try {
        const { proofHash } = req.params;
        return ok(res, await merkleService.getProofByHash(proofHash));
    } catch (e) {
        if (e.message.includes('not found')) return err(res, e, 404);
        return err(res, e);
    }
};

const getRootByVersion = async (req, res) => {
    try {
        const snapshot = await TreeSnapshot.findOne({ version: parseInt(req.params.version) });
        if (!snapshot) return err(res, new Error(`Version ${req.params.version} not found`), 404);
        return ok(res, { version: snapshot.version, root: snapshot.root, leafCount: snapshot.leafCount, createdAt: snapshot.createdAt });
    } catch (e) { return err(res, e); }
};

// ─── ADMIN ──────────────────────────────────────────────────────────────────

const rebuildTree = async (req, res) => {
    try { return ok(res, await merkleService.rebuildFromDatabase(), 'Tree rebuilt from DB'); }
    catch (e) { return err(res, e); }
};

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
    getRootByVersion,
    // admin
    rebuildTree
};