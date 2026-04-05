// services/merkleTree.service.js
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');
const { ethers } = require('ethers');
const TreeSnapshot = require('../models/treeSnapshot.model');
const VerifiedProof = require('../models/VerifiedProof.model');
const ZKPProofHasher = require('../utils/zkpHash');
const logger = require('../config/logger');

/**
 * MerkleTreeService
 * -----------------
 * Manages a StandardMerkleTree whose leaves are (bytes32 proofHash, uint256 timestamp).
 *
 * Flow:
 *  1. Caller submits a Groth16 proof  →  we hash it  →  addProofHash()
 *  2. addProofHash() rebuilds the tree, saves a TreeSnapshot and a VerifiedProof.
 *  3. Verification: caller supplies proofHash (or raw proof)  →
 *       we reconstruct the leaf  →  verifyLeaf() walks the stored Merkle path
 *       and recomputes the root, comparing against the stored on-chain root.
 */
class MerkleTreeService {
    constructor() {
        this.ZERO_HASH =
            '0x0000000000000000000000000000000000000000000000000000000000000000';
        this.LEAF_ENCODING = ['bytes32', 'uint256']; // leaf schema

        this.currentTree = null;   // StandardMerkleTree instance
        this.currentValues = [];     // raw leaf arrays   [[proofHash, ts], ...]
        this.currentRoot = this.ZERO_HASH;
        this.currentVersion = 0;
        this.currentLeafCount = 0;
        this.isInitialized = false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────────────────────────────────

    async initialize() {
        if (this.isInitialized) return this._statusSnapshot();

        console.log('🌲 Initializing Merkle Tree Service…');
        const latest = await TreeSnapshot.findOne().sort({ version: -1 });

        if (latest && latest.leafCount > 0) {
            this.currentTree = StandardMerkleTree.load(latest.treeJson);
            this.currentValues = latest.values || [];
            this.currentRoot = latest.root;
            this.currentVersion = latest.version;
            this.currentLeafCount = latest.leafCount;
            console.log(`📌 Restored v${this.currentVersion}  root=${this._short(this.currentRoot)}  leaves=${this.currentLeafCount}`);
        } else {
            console.log('✅ Empty tree (zero root)');
        }

        this.isInitialized = true;
        return this._statusSnapshot();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ADD
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Hash a raw Groth16 proof and add it to the tree.
     * @param {Object} proof - Groth16 proof object
     * @returns {Object} result with leafIndex, leafHash, merkleProof, root, version
     */
    async addZKPProof(proof) {
        const proofHash = ZKPProofHasher.hashFullProof(proof);
        return this.addProofHash(proofHash, proof);
    }

    /**
     * Add a pre-computed proof hash as a leaf.
     * @param {string} proofHash  - bytes32 hex string
     * @param {Object|null} proof - original proof (optional; stored for retrieval)
     */
    async addProofHash(proofHash, proof = null) {
        await this._ensureInit();

        // Prevent duplicates
        const existing = await VerifiedProof.findOne({ proofHash });
        if (existing) {
            throw new Error(`Proof hash already exists in tree at leaf index ${existing.merkleLeafIndex}`);
        }

        // Build leaf  [proofHash, timestamp]
        const timestamp = Date.now().toString();
        const leafValue = [proofHash, timestamp];

        this.currentValues.push(leafValue);
        this._rebuildTree();


        const leafIndex = this.currentValues.length - 1;
        const merkleProof = this.currentTree.getProof(leafIndex);
        const leafHash = this.currentTree.leafHash(leafValue);

        logger.info('---------------------------------------------------------------')
        logger.info('leaf index : '.leafIndex)
        logger.info('merkleProof : '.merkleProof)
        logger.info('leafHash : '.leafHash)


        logger.info('----------------------------------------------------------------')

        this.currentVersion++;

        // ── persist snapshot ──────────────────────────────────────────────
        await new TreeSnapshot({
            version: this.currentVersion,
            root: this.currentRoot,
            leafCount: this.currentLeafCount,
            treeJson: this.currentTree.dump(),
            values: [...this.currentValues],
            addedLeaf: { proofHash, leafValue, leafHash, leafIndex, proof: merkleProof },
            createdAt: new Date()
        }).save();

        // ── persist VerifiedProof record ──────────────────────────────────
        await new VerifiedProof({
            proofHash,
            originalProof: proof,
            merkleVersion: this.currentVersion,
            merkleLeafIndex: leafIndex,
            leafValue,
            merkleProof,
            root: this.currentRoot,
            timestamp: new Date()
        }).save();

        console.log(`✅ Added leaf[${leafIndex}]  root=${this._short(this.currentRoot)}`);
        return { proofHash, leafIndex, leafHash, merkleProof, root: this.currentRoot, version: this.currentVersion, leafCount: this.currentLeafCount };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VERIFY
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Core verification: given a proofHash, reconstruct the Merkle root from
     * the stored Merkle-path and compare with the current root.
     *
     * @param {string} proofHash  - bytes32 hex
     * @param {string} [expectedRoot] - optional; defaults to currentRoot
     * @returns {{ valid: boolean, computedRoot: string, storedRoot: string, leafIndex: number, leafHash: string }}
     */
    async verifyByProofHash(proofHash, expectedRoot = null) {
        await this._ensureInit();

        const record = await VerifiedProof.findOne({ proofHash });
        if (!record) {
            return { valid: false, reason: 'proof hash not found in database' };
        }

        const rootToCheck = expectedRoot || this.currentRoot;

        // Use OpenZeppelin verify (recomputes root from leaf+path)
        const isValid = StandardMerkleTree.verify(
            rootToCheck,
            this.LEAF_ENCODING,
            record.leafValue,
            record.merkleProof
        );

        // Also manually compute root so caller can inspect it
        const computedRoot = this._computeRootFromPath(
            this.currentTree.leafHash(record.leafValue),
            record.merkleProof
        );

        return {
            valid: isValid,
            computedRoot,
            storedRoot: rootToCheck,
            leafIndex: record.merkleLeafIndex,
            leafHash: this.currentTree.leafHash(record.leafValue),
            version: record.merkleVersion,
            timestamp: record.timestamp
        };
    }

    /**
     * Verify directly from a raw Groth16 proof object.
     * Hashes the proof then delegates to verifyByProofHash.
     */
    async verifyByRawProof(proof, expectedRoot = null) {
        const proofHash = ZKPProofHasher.hashFullProof(proof);
        const result = await this.verifyByProofHash(proofHash, expectedRoot);
        return { ...result, proofHash };
    }

    /**
     * Verify a leaf using a caller-supplied Merkle path (trustless).
     * Does NOT require a database lookup – pure cryptographic verification.
     *
     * @param {string} proofHash
     * @param {string} timestamp       - same timestamp stored at insertion
     * @param {string[]} merklePath    - array of sibling hashes
     * @param {string} rootToVerify
     */
    verifyWithPath(proofHash, timestamp, merklePath, rootToVerify) {
        const leafValue = [proofHash, timestamp];
        const isValid = StandardMerkleTree.verify(
            rootToVerify,
            this.LEAF_ENCODING,
            leafValue,
            merklePath
        );

        const computedRoot = this._computeRootFromPath(
            this._leafHash(leafValue),
            merklePath
        );

        return { valid: isValid, computedRoot, rootToVerify };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // QUERIES
    // ─────────────────────────────────────────────────────────────────────────

    async getProofByHash(proofHash) {
        await this._ensureInit();
        const record = await VerifiedProof.findOne({ proofHash });
        if (!record) throw new Error(`Proof hash ${proofHash} not found`);
        return {
            proofHash: record.proofHash,
            leafValue: record.leafValue,
            merkleVersion: record.merkleVersion,
            merkleLeafIndex: record.merkleLeafIndex,
            merkleProof: record.merkleProof,
            root: record.root,
            originalProof: record.originalProof,
            timestamp: record.timestamp
        };
    }

    async getCurrentRoot() {
        await this._ensureInit();
        return this._statusSnapshot();
    }

    async getTreeStats() {
        await this._ensureInit();
        return { ...this._statusSnapshot(), zeroHash: this.ZERO_HASH, lastUpdated: new Date().toISOString() };
    }

    async getAllProofs(page = 1, limit = 10) {
        await this._ensureInit();
        const skip = (page - 1) * limit;
        const proofs = await VerifiedProof.find({}).select('-originalProof').sort({ timestamp: -1 }).skip(skip).limit(limit);
        const total = await VerifiedProof.countDocuments();
        return { proofs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    async getAllLeaves(page = 1, limit = 100) {
        await this._ensureInit();
        const start = (page - 1) * limit;
        const leaves = this.currentValues.slice(start, start + limit).map((v, i) => ({
            index: start + i,
            proofHash: v[0],
            timestamp: v[1],
            leafHash: this.currentTree ? this.currentTree.leafHash(v) : null
        }));
        return { leaves, total: this.currentLeafCount, page, limit, totalPages: Math.ceil(this.currentLeafCount / limit) };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REBUILD
    // ─────────────────────────────────────────────────────────────────────────

    async rebuildFromDatabase() {
        console.log('🔄 Rebuilding from DB…');
        const proofs = await VerifiedProof.find({}).sort({ timestamp: 1 }).lean();

        if (proofs.length === 0) {
            this.currentValues = [];
            this.currentRoot = this.ZERO_HASH;
            this.currentLeafCount = 0;
            this.currentTree = null;
            this.isInitialized = true;
            return this._statusSnapshot();
        }

        this.currentValues = proofs.map(p => [p.proofHash, new Date(p.timestamp).getTime().toString()]);
        this._rebuildTree();
        this.currentVersion++;

        // Update all VerifiedProof Merkle paths
        for (let i = 0; i < proofs.length; i++) {
            await VerifiedProof.findByIdAndUpdate(proofs[i]._id, {
                merkleVersion: this.currentVersion,
                merkleLeafIndex: i,
                merkleProof: this.currentTree.getProof(i),
                root: this.currentRoot
            });
        }

        await new TreeSnapshot({
            version: this.currentVersion,
            root: this.currentRoot,
            leafCount: this.currentLeafCount,
            treeJson: this.currentTree.dump(),
            values: [...this.currentValues],
            rebuiltFromDB: true,
            createdAt: new Date()
        }).save();

        console.log(`✅ Rebuilt  v${this.currentVersion}  leaves=${this.currentLeafCount}  root=${this._short(this.currentRoot)}`);
        return this._statusSnapshot();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    _rebuildTree() {
        this.currentTree = StandardMerkleTree.of(this.currentValues, this.LEAF_ENCODING);
        this.currentRoot = this.currentTree.root;
        this.currentLeafCount = this.currentValues.length;
    }

    /**
     * Manually walk the Merkle path to compute root.
     * Mirrors OpenZeppelin's MerkleProof.sol processProof logic.
     */
    _computeRootFromPath(leafHash, path) {
        let current = leafHash;
        for (const sibling of path) {
            // Sort pair before hashing (matches OZ sorted-pair hash)
            const [a, b] = current.toLowerCase() < sibling.toLowerCase()
                ? [current, sibling]
                : [sibling, current];
            current = ethers.keccak256(
                ethers.concat([ethers.getBytes(a), ethers.getBytes(b)])
            );
        }
        return current;
    }

    _leafHash(leafValue) {
        return this.currentTree ? this.currentTree.leafHash(leafValue) : null;
    }

    async _ensureInit() {
        if (!this.isInitialized) await this.initialize();
    }

    _statusSnapshot() {
        return { root: this.currentRoot, version: this.currentVersion, leafCount: this.currentLeafCount };
    }

    _short(h) { return h ? `${h.slice(0, 10)}…` : 'none'; }
}

module.exports = new MerkleTreeService();