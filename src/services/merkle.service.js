// services/merkleTree.service.js
//
// Architecture: Incremental Merkle Tree (IMT) with Poseidon hash
// ──────────────────────────────────────────────────────────────
// • Uses @zk-kit/imt  (IncrementalMerkleTree)
// • Hash function : Poseidon (ZK-friendly, matches Groth16/snarkjs circuits)
// • Insert cost   : O(depth) — only the path from new leaf → root is recomputed
// • Memory        : Only the "filled subtrees" array (depth+1 nodes) lives in RAM,
//                   NOT all leaves.  RAM is O(depth) = O(20) = constant regardless
//                   of how many leaves you have inserted.
// • DB role       : Source of truth for leaf records + sparse state checkpoint
// • On-chain role : (STUBBED) Root anchor — enables trustless verification
//
// Flow
// ────
//   addZKPProof(proof)
//     → hash proof with keccak256          (ZKPProofHasher)
//     → convert proofHash to BigInt leaf
//     → tree.insert(leaf)                  O(depth)
//     → new root computed automatically
//     → persist VerifiedProof + TreeState to MongoDB
//     → [FUTURE] submit root to chain
//
//   verifyByProofHash(proofHash)
//     → lookup VerifiedProof in DB          (confirms leaf exists + gets leafIndex)
//     → regenerate sibling path from live IMT via createProof(leafIndex)  O(depth)
//     → recompute root from leaf + fresh path
//     → compare against this.currentRoot
//     → ALL leaves always valid against the latest root
//
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { IMT } = require('@zk-kit/imt');
const { poseidon2 } = require('poseidon-lite');
const { ethers } = require('ethers');
const ZKPProofHasher = require('../utils/zkpHash');
const VerifiedProof = require('../models/VerifiedProof.model');
const TreeState = require('../models/treeState.model');
const logger = require('../config/logger');

// ─── Constants ───────────────────────────────────────────────────────────────

const TREE_DEPTH = 20;          // supports 2^20 ≈ 1 048 576 leaves
const TREE_ARITY = 2;           // binary tree
const ZERO_VALUE = BigInt(0);   // padding value for empty leaves
const ZERO_ROOT = '0x' + '0'.repeat(64);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a 0x-prefixed keccak256 hex string to BigInt.
 * IMT works in the field of Poseidon, which takes BigInt inputs.
 */
function hexToBigInt(hex) {
    return BigInt(hex);
}

/**
 * Convert a BigInt root to a 0x-prefixed 32-byte hex string
 * so it looks like a standard Ethereum bytes32.
 */
function bigIntToHex(n) {
    return '0x' + n.toString(16).padStart(64, '0');
}

// ─────────────────────────────────────────────────────────────────────────────
// MerkleTreeService
// ─────────────────────────────────────────────────────────────────────────────

class MerkleTreeService {
    constructor() {
        // ── In-memory state (O(depth) RAM, not O(N)) ──────────────────────
        this.tree = null;   // IMT instance
        this.currentRoot = ZERO_ROOT;
        this.currentVersion = 0;
        this.currentLeafCount = 0;
        this.isInitialized = false;

        // ── On-chain stub (FUTURE) ─────────────────────────────────────────
        // When ONCHAIN_ENABLED=true the service will:
        //   1. submitRootToChain() after every insert (or batched)
        //   2. getRootFromChain()  during verification instead of DB root
        // Keep false until smart contract is deployed.
        this.ONCHAIN_ENABLED = false;
    }

    // =========================================================================
    // INIT — restore sparse state from DB, replay inserts to rebuild IMT
    // =========================================================================

    /**
     * initialize()
     * Called once at server startup (or lazily on first request).
     *
     * Strategy:
     *   1. Load the latest TreeState checkpoint (filledSubtrees + leafCount).
     *   2. Create a fresh IMT and fast-forward it by re-inserting leaves
     *      that arrived AFTER the checkpoint (usually 0 if checkpoint is current).
     *   3. If no checkpoint exists, replay ALL leaves from VerifiedProof collection.
     *
     * This keeps startup O(N) in the worst case (cold start, no checkpoint)
     * but O(new leaves since last checkpoint) in normal operation.
     */
    async initialize() {
        if (this.isInitialized) return this._status();

        console.log('🌲 [MerkleTree] Initializing incremental Poseidon tree…');

        // Create a fresh IMT — will be populated below
        this.tree = new IMT(poseidon2, TREE_DEPTH, ZERO_VALUE, TREE_ARITY);

        const checkpoint = await TreeState.findOne().sort({ version: -1 });

        if (checkpoint && checkpoint.leafCount > 0) {
            // ── Fast path: restore from checkpoint ──────────────────────────
            // IMT stores O(depth) "filledSubtrees" — that is all we need to
            // restore the tree to the exact state it was in at checkpoint time.
            this._restoreFromCheckpoint(checkpoint);
            console.log(`📌 [MerkleTree] Restored from checkpoint v${this.currentVersion} — ${this.currentLeafCount} leaves`);

            // Replay any leaves inserted after the checkpoint
            const newLeaves = await VerifiedProof.find({
                merkleVersion: { $gt: checkpoint.version }
            }).sort({ merkleVersion: 1 }).lean();

            if (newLeaves.length > 0) {
                console.log(`🔄 [MerkleTree] Replaying ${newLeaves.length} leaves inserted after checkpoint…`);
                for (const lf of newLeaves) {
                    this.tree.insert(hexToBigInt(lf.proofHash));
                }
                this.currentRoot = bigIntToHex(this.tree.root);
                this.currentLeafCount = this.tree.leaves.length;
                this.currentVersion = newLeaves[newLeaves.length - 1].merkleVersion;
            }
        } else {
            // ── Cold start: replay everything from VerifiedProof ────────────
            const allLeaves = await VerifiedProof.find({})
                .sort({ merkleVersion: 1 })
                .select('proofHash')
                .lean();

            if (allLeaves.length > 0) {
                console.log(`🔄 [MerkleTree] Cold start — replaying ${allLeaves.length} leaves…`);
                for (const lf of allLeaves) {
                    this.tree.insert(hexToBigInt(lf.proofHash));
                }
                this.currentRoot = bigIntToHex(this.tree.root);
                this.currentLeafCount = this.tree.leaves.length;

                const lastRecord = await VerifiedProof.findOne().sort({ merkleVersion: -1 });
                this.currentVersion = lastRecord ? lastRecord.merkleVersion : 0;
            } else {
                console.log('✅ [MerkleTree] Empty tree — zero root');
            }
        }

        this.isInitialized = true;
        console.log(`✅ [MerkleTree] Ready  root=${this._short(this.currentRoot)}  leaves=${this.currentLeafCount}`);
        return this._status();
    }

    // =========================================================================
    // ADD
    // =========================================================================

    /**
     * addZKPProof(proof)
     * Hash a raw Groth16 proof with keccak256, then insert into the tree.
     *
     * @param {Object} proof - Groth16 proof { pi_a, pi_b, pi_c, protocol, curve }
     * @returns {Object} insertion result
     */
    async addZKPProof(proof) {
        const proofHash = ZKPProofHasher.hashFullProof(proof);
        return this._insertLeaf(proofHash, proof);
    }

    /**
     * addProofHash(proofHash)
     * Insert a pre-computed 0x-prefixed keccak256 hash as a leaf.
     *
     * @param {string} proofHash - bytes32 hex
     * @returns {Object} insertion result
     */
    async addProofHash(proofHash) {
        return this._insertLeaf(proofHash, null);
    }

    /**
     * _insertLeaf — internal core insert
     *
     * 1. Duplicate check
     * 2. tree.insert(BigInt) — O(depth) Poseidon hashes
     * 3. Generate sibling path (merkle proof) — O(depth)
     * 4. Persist VerifiedProof record
     * 5. Periodically persist TreeState checkpoint
     * 6. [FUTURE] Submit root to chain
     *
     * NOTE: The merkleProof stored here is a snapshot at insertion time.
     *       It is used only for trustless offline verification (verifyWithPath).
     *       Server-side verification (verifyByProofHash) always regenerates
     *       the path live from the in-memory tree so it stays valid against
     *       the ever-growing current root.
     */
    async _insertLeaf(proofHash, originalProof = null) {
        await this._ensureInit();

        // ── 1. Duplicate guard ────────────────────────────────────────────
        const existing = await VerifiedProof.findOne({ proofHash });
        if (existing) {
            throw new Error(
                `Duplicate: proof hash already in tree at leaf index ${existing.merkleLeafIndex}`
            );
        }

        // ── 2. Insert into IMT — O(depth), NOT O(N) ───────────────────────
        const leafBigInt = hexToBigInt(proofHash);
        const leafIndex = this.tree.leaves.length; // index BEFORE insert
        this.tree.insert(leafBigInt);

        // ── 3. Update in-memory state ─────────────────────────────────────
        this.currentRoot = bigIntToHex(this.tree.root);
        this.currentLeafCount = this.tree.leaves.length;
        this.currentVersion++;

        // ── 4. Generate Merkle proof (sibling path) ───────────────────────
        //    IMT.createProof(index) returns { root, leaf, siblings, pathIndices }
        //    siblings: array of BigInt sibling hashes at each level
        //    pathIndices: 0 = left child, 1 = right child at each level
        //
        //    This snapshot is stored for OFFLINE / trustless use only.
        //    verifyByProofHash() does NOT use this — it regenerates live.
        const iMTProof = this.tree.createProof(leafIndex);

        // Convert BigInts to hex strings for JSON storage
        const merkleProof = {
            root: bigIntToHex(iMTProof.root),
            leaf: bigIntToHex(iMTProof.leaf),
            siblings: iMTProof.siblings.map(s => bigIntToHex(Array.isArray(s) ? s[0] : s)),
            pathIndices: iMTProof.pathIndices,
            leafIndex
        };

        console.log(`✅ [MerkleTree] Inserted leaf[${leafIndex}]  root=${this._short(this.currentRoot)}`);

        // ── 5. Persist VerifiedProof ──────────────────────────────────────
        const record = await new VerifiedProof({
            proofHash,
            originalProof,
            merkleVersion: this.currentVersion,
            merkleLeafIndex: leafIndex,
            merkleProof,    // snapshot for offline use; server-side verify regenerates live
            root: this.currentRoot,
            timestamp: new Date()
        }).save();

        // ── 6. Checkpoint every 100 inserts ──────────────────────────────
        //    Checkpointing saves the IMT's internal "filledSubtrees" array.
        //    On restart we restore from here instead of replaying from scratch.
        if (this.currentLeafCount % 100 === 0) {
            await this._saveCheckpoint();
        }

        // ── 7. [FUTURE] On-chain root submission ─────────────────────────
        //    Uncomment when smart contract is deployed.
        //    await this._submitRootToChain(this.currentVersion, this.currentRoot);

        return {
            proofHash,
            leafIndex,
            merkleProof,
            root: this.currentRoot,
            version: this.currentVersion,
            leafCount: this.currentLeafCount
        };
    }

    // =========================================================================
    // VERIFY
    // =========================================================================

    /**
     * verifyByProofHash(proofHash, expectedRoot?)
     *
     * Live verification — always valid against the current root.
     *
     * How it works:
     *   1. Look up the leaf's index from MongoDB (confirms the leaf exists).
     *   2. Call this.tree.createProof(leafIndex) to get the CURRENT sibling path.
     *      This path reflects the tree as it is RIGHT NOW — after all insertions.
     *   3. Walk the path with Poseidon to recompute the root.
     *   4. Compare against this.currentRoot.
     *
     * Why this is correct:
     *   Every leaf is always a member of the latest tree.  When a new leaf is
     *   added the root changes, but every existing leaf's path simply gains an
     *   updated sibling at one level.  createProof() returns that updated path,
     *   so the recomputed root always matches currentRoot for any valid leaf.
     *
     * expectedRoot:
     *   • omitted / 'offchain' → compare against this.currentRoot (default)
     *   • 'onchain'            → [FUTURE] fetch root from smart contract
     *   • any hex string       → compare against that specific root
     *
     * @returns {{ valid, computedRoot, trustedRoot, leafIndex, version, timestamp }}
     */
    async verifyByProofHash(proofHash, expectedRoot = 'offchain') {
        await this._ensureInit();

        // ── 1. Confirm leaf exists in DB and get its index ────────────────
        const record = await VerifiedProof.findOne({ proofHash });
        if (!record) {
            return {
                valid: false,
                reason: 'proof hash not found in database'
            };
        }

        // ── 2. Determine trusted root ─────────────────────────────────────
        let trustedRoot;
        if (expectedRoot === 'onchain') {
            // [FUTURE] swap this comment out when contract is live
            // trustedRoot = await this._getRootFromChain();
            trustedRoot = this.currentRoot; // placeholder until on-chain is enabled
            console.warn('⚠️  [MerkleTree] On-chain root fetch not yet enabled — using in-memory root');
        } else if (expectedRoot && expectedRoot !== 'offchain') {
            // Caller supplied a specific root to verify against
            trustedRoot = expectedRoot;
        } else {
            trustedRoot = this.currentRoot;
        }

        // ── 3. Regenerate sibling path from the LIVE in-memory tree ──────
        //
        //    CRITICAL: do NOT use record.merkleProof here.
        //    That path was correct at insertion time but siblings change as
        //    new leaves are added.  createProof() always returns the path
        //    that is consistent with the current root.
        //
        const iMTProof = this.tree.createProof(record.merkleLeafIndex);
        const freshProof = {
            siblings: iMTProof.siblings.map(s => bigIntToHex(Array.isArray(s) ? s[0] : s)),
            pathIndices: iMTProof.pathIndices
        };

        // ── 4. Recompute root by walking the fresh path ───────────────────
        const { computedRoot, valid } = this._verifyIMTProof(proofHash, freshProof);

        // ── 5. Compare ────────────────────────────────────────────────────
        const isValid = valid && (computedRoot === trustedRoot);

        logger.info(`[MerkleTree] verify leaf[${record.merkleLeafIndex}] → ${isValid ? 'VALID' : 'INVALID'}  computed=${this._short(computedRoot)}  trusted=${this._short(trustedRoot)}`);

        return {
            valid: isValid,
            computedRoot,
            trustedRoot,
            leafIndex: record.merkleLeafIndex,
            version: record.merkleVersion,
            timestamp: record.timestamp,
            rootSource: expectedRoot === 'onchain' ? 'onchain (stub)' : 'current'
        };
    }

    /**
     * verifyByRawProof(proof, expectedRoot?)
     * Hash the Groth16 proof first, then delegate to verifyByProofHash.
     */
    async verifyByRawProof(proof) {
        let expectedRoot = 'offchain';
        const proofHash = ZKPProofHasher.hashFullProof(proof);
        const result = await this.verifyByProofHash(proofHash, expectedRoot);
        return { ...result, proofHash };
    }

    /**
     * verifyWithPath(proofHash, merkleProof, rootToVerify)
     *
     * TRUSTLESS / OFFLINE verification — no DB lookup, no live tree needed.
     * Caller supplies the full merkleProof object they received at insertion time
     * AND the root that was current at that moment (e.g. anchored on-chain).
     *
     * Use this when you want to prove membership at a specific historical root,
     * not the latest root.  For latest-root verification use verifyByProofHash.
     *
     * @param {string} proofHash      - 0x-prefixed keccak256
     * @param {Object} merkleProof    - { siblings, pathIndices } from insertion response
     * @param {string} rootToVerify   - the root to check against (e.g. from on-chain)
     */
    verifyWithPath(proofHash, merkleProof, rootToVerify) {
        const { computedRoot, valid } = this._verifyIMTProof(proofHash, merkleProof);
        const matchesRoot = computedRoot === rootToVerify;

        return {
            valid: valid && matchesRoot,
            computedRoot,
            rootToVerify,
            pathValid: valid,
            rootMatches: matchesRoot
        };
    }

    // =========================================================================
    // QUERIES
    // =========================================================================

    async getCurrentRoot() {
        await this._ensureInit();
        return this._status();
    }

    async getTreeStats() {
        await this._ensureInit();
        const checkpointCount = await TreeState.countDocuments();
        return {
            ...this._status(),
            treeDepth: TREE_DEPTH,
            maxLeaves: Math.pow(2, TREE_DEPTH),
            hashFunction: 'poseidon2',
            zeroRoot: ZERO_ROOT,
            checkpoints: checkpointCount,
            onchainEnabled: this.ONCHAIN_ENABLED,
            lastUpdated: new Date().toISOString()
        };
    }

    async getProofByHash(proofHash) {
        await this._ensureInit();
        const record = await VerifiedProof.findOne({ proofHash });
        if (!record) throw new Error(`Proof hash ${proofHash} not found`);

        // Return a freshly generated path so the caller always gets a
        // proof that verifies against the current root.
        const iMTProof = this.tree.createProof(record.merkleLeafIndex);
        const freshMerkleProof = {
            root: this.currentRoot,
            leaf: bigIntToHex(iMTProof.leaf),
            siblings: iMTProof.siblings.map(s => bigIntToHex(Array.isArray(s) ? s[0] : s)),
            pathIndices: iMTProof.pathIndices,
            leafIndex: record.merkleLeafIndex
        };

        return {
            proofHash: record.proofHash,
            merkleVersion: record.merkleVersion,
            merkleLeafIndex: record.merkleLeafIndex,
            merkleProof: freshMerkleProof,  // always current
            root: this.currentRoot,         // always current
            originalProof: record.originalProof,
            timestamp: record.timestamp
        };
    }

    async getAllProofs(page = 1, limit = 10) {
        await this._ensureInit();
        const skip = (page - 1) * limit;
        const proofs = await VerifiedProof
            .find({})
            .select('-originalProof')
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit);
        const total = await VerifiedProof.countDocuments();
        return {
            proofs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        };
    }

    /**
     * getAllLeaves — reads from DB (not RAM), so works regardless of RAM state.
     * Leaves are stored in VerifiedProof sorted by merkleLeafIndex.
     */
    async getAllLeaves(page = 1, limit = 100) {
        await this._ensureInit();
        const skip = (page - 1) * limit;
        const records = await VerifiedProof
            .find({})
            .select('proofHash merkleLeafIndex root merkleVersion timestamp')
            .sort({ merkleLeafIndex: 1 })
            .skip(skip)
            .limit(limit);
        const total = await VerifiedProof.countDocuments();

        return {
            leaves: records.map(r => ({
                index: r.merkleLeafIndex,
                proofHash: r.proofHash,
                root: this.currentRoot,  // always report current root
                version: r.merkleVersion,
                timestamp: r.timestamp
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    // =========================================================================
    // REBUILD — re-run all inserts from DB (admin / disaster recovery)
    // =========================================================================

    /**
     * rebuildFromDatabase()
     *
     * Wipes in-memory IMT and rebuilds from scratch by replaying
     * every leaf in VerifiedProof (sorted by merkleLeafIndex).
     *
     * When complete, saves a fresh checkpoint so next restart is fast.
     *
     * Cost: O(N × depth) — linear in number of leaves.
     * Use only for disaster recovery or after a data migration.
     *
     * NOTE: We no longer overwrite record.root with this.currentRoot here.
     *       Each record.root is a historical snapshot; verification uses
     *       the live tree, not these stored roots.
     */
    async rebuildFromDatabase() {
        console.log('🔄 [MerkleTree] Rebuilding from database…');

        // Fresh IMT
        this.tree = new IMT(poseidon2, TREE_DEPTH, ZERO_VALUE, TREE_ARITY);
        this.currentRoot = ZERO_ROOT;
        this.currentVersion = 0;
        this.currentLeafCount = 0;

        const allLeaves = await VerifiedProof
            .find({})
            .sort({ merkleLeafIndex: 1 })
            .select('proofHash merkleVersion _id');

        logger.info(Array.isArray(allLeaves));
        if (!allLeaves || allLeaves.length === 0) {
            this.isInitialized = true;
            console.log('ℹ️  [MerkleTree] No leaves found — empty tree');
            return this._status();
        }

        // Re-insert every leaf — O(N × depth)
        for (const lf of allLeaves) {
            this.tree.insert(hexToBigInt(lf.proofHash));
        }

        this.currentRoot = bigIntToHex(this.tree.root);
        this.currentLeafCount = this.tree.leaves.length;
        this.currentVersion = allLeaves[allLeaves.length - 1].merkleVersion;

        // Re-generate and store the fresh sibling path for each leaf.
        // These are stored as snapshots for offline/trustless use.
        // Server-side verifyByProofHash() regenerates paths live and does
        // NOT depend on these stored paths being up to date.
        console.log(allLeaves.length);
        console.log('🔄 [MerkleTree] Updating Merkle proofs in DB…');
        for (let i = 0; i < allLeaves.length; i++) {
            const iMTProof = this.tree.createProof(i);
            const merkleProof = {
                root: bigIntToHex(iMTProof.root),       // current root (post-rebuild)
                leaf: bigIntToHex(iMTProof.leaf),
                siblings: iMTProof.siblings.map(s => bigIntToHex(Array.isArray(s) ? s[0] : s)),
                pathIndices: iMTProof.pathIndices,
                leafIndex: i
            };

            await VerifiedProof.findByIdAndUpdate(allLeaves[i]._id, {
                merkleProof
                // root and merkleVersion are intentionally NOT overwritten here —
                // they are historical metadata, not verification inputs.
            });
        }

        // Save fresh checkpoint
        await this._saveCheckpoint(true);

        this.isInitialized = true;

        console.log(`✅ [MerkleTree] Rebuild complete  v${this.currentVersion}  leaves=${this.currentLeafCount}  root=${this._short(this.currentRoot)}`);
        return this._status();
    }

    // =========================================================================
    // ON-CHAIN STUB  (FUTURE — do not remove, enable when contract is deployed)
    // =========================================================================

    /**
     * submitRootToChain(version, root)
     *
     * [FUTURE] Call your smart contract to anchor the Merkle root on-chain.
     * Once anchored, verification can use the on-chain root instead of the DB root,
     * making the system fully trustless — even if your server is compromised,
     * a user can prove membership with just their merkleProof + the on-chain root.
     *
     * Suggested Solidity interface:
     *   function submitRoot(uint256 version, bytes32 root) external onlyOwner
     *   function getRoot(uint256 version) external view returns (bytes32)
     *
     * @param {number} version
     * @param {string} root - hex bytes32
     */
    async _submitRootToChain(version, root) {
        if (!this.ONCHAIN_ENABLED) {
            console.log(`[ONCHAIN STUB] submitRoot(v${version}, ${this._short(root)}) — not yet enabled`);
            return { submitted: false, reason: 'ONCHAIN_ENABLED=false' };
        }

        /* ── FUTURE IMPLEMENTATION ────────────────────────────────────────────
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const signer   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const contract = new ethers.Contract(
            process.env.MERKLE_CONTRACT_ADDRESS,
            MERKLE_CONTRACT_ABI,        // import from ../abi/MerkleRoot.json
            signer
        );

        const tx = await contract.submitRoot(version, root);
        await tx.wait();

        // Save submission record
        await TreeState.findOneAndUpdate(
            { version },
            { submittedToChain: true, txHash: tx.hash, submittedAt: new Date() },
            { new: true }
        );

        console.log(`⛓  [OnChain] Root v${version} submitted  tx=${tx.hash}`);
        return { submitted: true, txHash: tx.hash };
        ── END FUTURE ─────────────────────────────────────────────────────── */

        return { submitted: false, reason: 'implementation pending' };
    }

    /**
     * getRootFromChain(version)
     *
     * [FUTURE] Fetch an anchored root from the smart contract.
     * Used in verifyByProofHash when expectedRoot === 'onchain'.
     */
    async _getRootFromChain(version) {
        if (!this.ONCHAIN_ENABLED) {
            console.log(`[ONCHAIN STUB] getRoot(v${version}) — not yet enabled`);
            return this.currentRoot; // fallback
        }

        /* ── FUTURE IMPLEMENTATION ────────────────────────────────────────────
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const contract = new ethers.Contract(
            process.env.MERKLE_CONTRACT_ADDRESS,
            MERKLE_CONTRACT_ABI,
            provider
        );
        const root = await contract.getRoot(version);
        return root; // already bytes32 hex from ethers
        ── END FUTURE ─────────────────────────────────────────────────────── */

        return this.currentRoot;
    }

    // =========================================================================
    // PRIVATE HELPERS
    // =========================================================================

    /**
     * _verifyIMTProof
     * Recompute the Merkle root from a leaf hash + sibling path using Poseidon.
     * This mirrors exactly what the ZK circuit does during proof verification.
     *
     * @param {string} proofHash  - 0x-prefixed hex
     * @param {Object} merkleProof - { siblings: string[], pathIndices: number[] }
     * @returns {{ computedRoot: string, valid: boolean }}
     */
    _verifyIMTProof(proofHash, merkleProof) {
        try {
            const { siblings, pathIndices } = merkleProof;

            let current = hexToBigInt(proofHash);

            for (let i = 0; i < siblings.length; i++) {
                const sibling = hexToBigInt(siblings[i]);
                // pathIndices[i] = 0 → current is left child
                // pathIndices[i] = 1 → current is right child
                const [left, right] = pathIndices[i] === 0
                    ? [current, sibling]
                    : [sibling, current];

                current = poseidon2([left, right]);
            }

            const computedRoot = bigIntToHex(current);
            return { computedRoot, valid: true };
        } catch (err) {
            console.error('[MerkleTree] _verifyIMTProof error:', err.message);
            return { computedRoot: ZERO_ROOT, valid: false };
        }
    }

    /**
     * _saveCheckpoint()
     * Persist the IMT's internal state to MongoDB so restart is fast.
     */
    async _saveCheckpoint(isRebuild = false) {
        // Serialize BigInt arrays to hex for MongoDB
        const zeroes = this.tree.zeroes.map(z => bigIntToHex(z));

        // Serialize sparse node map: array of { level, index, value }
        const nodes = [];
        for (let level = 0; level < this.tree._nodes.length; level++) {
            for (let [index, value] of this.tree._nodes[level].entries()) {
                nodes.push({ level, index, value: bigIntToHex(value) });
            }
        }

        await TreeState.findOneAndUpdate(
            { version: this.currentVersion },
            {
                version: this.currentVersion,
                root: this.currentRoot,
                leafCount: this.currentLeafCount,
                depth: TREE_DEPTH,
                zeroes,
                nodes,
                isRebuild,
                savedAt: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(`💾 [MerkleTree] Checkpoint saved  v${this.currentVersion}  leaves=${this.currentLeafCount}`);
    }

    /**
     * _restoreFromCheckpoint(checkpoint)
     * Re-hydrate the IMT from a saved TreeState checkpoint.
     */
    _restoreFromCheckpoint(checkpoint) {
        // Restore zeroes
        this.tree.zeroes = checkpoint.zeroes.map(z => hexToBigInt(z));

        // Restore sparse node maps
        this.tree.nodes = Array.from({ length: TREE_DEPTH + 1 }, () => new Map());
        for (const { level, index, value } of checkpoint.nodes) {
            this.tree.nodes[level].set(index, hexToBigInt(value));
        }

        // Restore leaf count so next insert lands at the correct index
        this.tree._leavesCount = checkpoint.leafCount;

        // Update service state
        this.currentRoot = checkpoint.root;
        this.currentVersion = checkpoint.version;
        this.currentLeafCount = checkpoint.leafCount;
    }

    async _ensureInit() {
        if (!this.isInitialized) await this.initialize();
    }

    _status() {
        return {
            root: this.currentRoot,
            version: this.currentVersion,
            leafCount: this.currentLeafCount
        };
    }

    _short(h) {
        return h ? `${h.slice(0, 10)}…` : 'none';
    }
}

// Export singleton — the same IMT instance lives for the lifetime of the process
module.exports = new MerkleTreeService();