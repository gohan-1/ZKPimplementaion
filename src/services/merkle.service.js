// services/merkleTree.service.js
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');
const Credential = require('../models/credential.model');
const TreeSnapshot = require('../models/treeSnapshot.model');
const VerifiedProof = require('../models/VerifiedProof.model');
const ZKPProofHasher = require('../utils/zkpHash');

class MerkleTreeService {
    constructor() {
        this.ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
        this.currentTree = null;
        this.currentValues = [];
        this.currentRoot = this.ZERO_HASH;
        this.currentVersion = 0;
        this.currentLeafCount = 0;
        this.isInitialized = false;
    }

    /**
     * Initialize the service (load latest snapshot)
     */
    async initialize() {
        console.log('🌲 Initializing Merkle Tree Service...');

        // Load latest snapshot from database
        const latestSnapshot = await TreeSnapshot.findOne().sort({ version: -1 });

        if (latestSnapshot && latestSnapshot.leafCount > 0) {
            // Restore existing tree
            this.currentTree = StandardMerkleTree.load(latestSnapshot.treeJson);
            this.currentValues = latestSnapshot.values || [];
            this.currentRoot = latestSnapshot.root;
            this.currentVersion = latestSnapshot.version;
            this.currentLeafCount = latestSnapshot.leafCount;
            this.isInitialized = true;

            console.log(`📌 Restored tree - Version: ${this.currentVersion}, Root: ${this.currentRoot}, Leaves: ${this.currentLeafCount}`);
        } else {
            // Start with empty tree
            this.currentValues = [];
            this.currentRoot = this.ZERO_HASH;
            this.currentVersion = 0;
            this.currentLeafCount = 0;
            this.currentTree = null;
            this.isInitialized = true;

            console.log(`✅ Initialized empty tree with zero root`);
        }

        return {
            root: this.currentRoot,
            version: this.currentVersion,
            leafCount: this.currentLeafCount
        };
    }

    /**
     * Create leaf from proof hash only (simplified)
     * @param {string} proofHash - Hash of the ZKP proof
     * @returns {Array} Leaf value for Merkle tree
     */
    createLeafFromProofHash(proofHash) {
        // Simplified leaf: just proof hash + timestamp
        const leafValue = [
            proofHash,                           // bytes32 - ZKP proof hash
            Date.now().toString()                // uint256 - Timestamp for uniqueness
        ];
        return leafValue;
    }

    /**
     * Add a proof hash directly to the tree
     * @param {string} proofHash - Hash of the ZKP proof
     * @param {Object} proof - Original proof object (for storage)
     */
    async addProofHash(proofHash, proof = null) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        console.log('➕ Adding proof hash to Merkle tree...');
        console.log(`   Proof Hash: ${proofHash.substring(0, 20)}...`);

        // Create leaf from proof hash
        const leafValue = this.createLeafFromProofHash(proofHash);

        // Add to values array
        this.currentValues.push(leafValue);

        // Build tree from all values
        this.currentTree = StandardMerkleTree.of(
            this.currentValues,
            ['bytes32', 'uint256']  // Only 2 fields: proof hash + timestamp
        );

        // Update root and leaf count
        this.currentRoot = this.currentTree.root;
        this.currentLeafCount = this.currentValues.length;
        this.currentVersion++;

        // Get proof for the newly added leaf
        const leafIndex = this.currentValues.length - 1;
        const merkleProof = this.currentTree.getProof(leafIndex);
        const leafHash = this.currentTree.leafHash(leafValue);

        // Save snapshot to database
        const snapshot = new TreeSnapshot({
            version: this.currentVersion,
            root: this.currentRoot,
            leafCount: this.currentLeafCount,
            treeJson: this.currentTree.dump(),
            values: [...this.currentValues],
            addedLeaf: {
                proofHash: proofHash,
                leafValue: leafValue,
                leafHash: leafHash,
                leafIndex: leafIndex,
                proof: merkleProof
            },
            createdAt: new Date()
        });

        await snapshot.save();

        // Store proof mapping in database (if proof object provided)
        if (proof) {
            const proofRecord = new VerifiedProof({
                proofHash: proofHash,
                originalProof: proof,
                merkleVersion: this.currentVersion,
                merkleLeafIndex: leafIndex,
                merkleProof: merkleProof,
                root: this.currentRoot,
                timestamp: new Date()
            });
            await proofRecord.save();
        }

        console.log(`✅ Proof hash added at index ${leafIndex}`);
        console.log(`   Leaf Hash: ${leafHash}`);
        console.log(`   New Root: ${this.currentRoot}`);
        console.log(`   Version: ${this.currentVersion}`);

        return {
            proofHash: proofHash,
            leafIndex: leafIndex,
            leafHash: leafHash,
            merkleProof: merkleProof,
            root: this.currentRoot,
            version: this.currentVersion,
            leafCount: this.currentLeafCount
        };
    }

    /**
     * Add ZKP proof (simplified - only proof required)
     * @param {Object} proof - Groth16 proof object
     */
    async addZKPProof(proof) {
        // Hash the proof
        const proofHash = ZKPProofHasher.hashFullProof(proof);

        console.log('📝 Adding ZKP proof to Merkle tree...');
        console.log(`   Proof Hash: ${proofHash.substring(0, 20)}...`);

        // Add to tree
        const result = await this.addProofHash(proofHash, proof);

        return result;
    }

    /**
     * Get proof by proof hash (commitment)
     * @param {string} proofHash - Hash of the proof
     */
    async getProofByHash(proofHash) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const proofRecord = await VerifiedProof.findOne({ proofHash: proofHash });

        if (!proofRecord) {
            throw new Error(`Proof hash ${proofHash} not found`);
        }

        return {
            proofHash: proofRecord.proofHash,
            merkleVersion: proofRecord.merkleVersion,
            merkleLeafIndex: proofRecord.merkleLeafIndex,
            merkleProof: proofRecord.merkleProof,
            root: proofRecord.root,
            originalProof: proofRecord.originalProof,
            timestamp: proofRecord.timestamp
        };
    }

    /**
     * Verify if a proof hash exists in tree
     * @param {string} proofHash - Hash of the proof
     */
    async verifyProofHashExists(proofHash) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const proofRecord = await VerifiedProof.findOne({ proofHash: proofHash });

        if (!proofRecord) {
            return { exists: false };
        }

        return {
            exists: true,
            leafIndex: proofRecord.merkleLeafIndex,
            version: proofRecord.merkleVersion,
            root: proofRecord.root
        };
    }

    /**
     * Get current root
     */
    async getCurrentRoot() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        return {
            root: this.currentRoot,
            version: this.currentVersion,
            leafCount: this.currentLeafCount
        };
    }

    /**
     * Get tree statistics
     */
    async getTreeStats() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        return {
            version: this.currentVersion,
            root: this.currentRoot,
            leafCount: this.currentLeafCount,
            zeroHash: this.ZERO_HASH,
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Get all verified proofs (paginated)
     */
    async getAllProofs(page = 1, limit = 10) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const skip = (page - 1) * limit;

        const proofs = await VerifiedProof.find({})
            .select('-originalProof')  // Exclude large proof object
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await VerifiedProof.countDocuments();

        return {
            proofs: proofs,
            pagination: {
                page: page,
                limit: limit,
                total: total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get all leaves (paginated)
     */
    async getAllLeaves(page = 1, limit = 100) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const start = (page - 1) * limit;
        const end = start + limit;
        const leaves = this.currentValues.slice(start, end);

        const leavesWithHashes = leaves.map((leaf, idx) => ({
            index: start + idx,
            value: leaf,
            hash: this.currentTree ? this.currentTree.leafHash(leaf) : null
        }));

        return {
            leaves: leavesWithHashes,
            total: this.currentLeafCount,
            page: page,
            limit: limit,
            totalPages: Math.ceil(this.currentLeafCount / limit)
        };
    }

    /**
     * Verify a Merkle proof
     */
    verifyProof(leafValue, proof, root = null) {
        const rootToVerify = root || this.currentRoot;
        return StandardMerkleTree.verify(
            rootToVerify,
            ['bytes32', 'uint256'],
            leafValue,
            proof
        );
    }

    /**
     * Rebuild tree from database
     */
    async rebuildFromDatabase() {
        console.log('🔄 Rebuilding Merkle tree from database...');

        // Get all verified proofs
        const proofs = await VerifiedProof.find({}).sort({ createdAt: 1 }).lean();

        if (proofs.length === 0) {
            console.log('No proofs found, keeping empty tree');
            return await this.initialize();
        }

        // Build values array from stored proofs
        const values = proofs.map(proof => [
            proof.proofHash,
            proof.timestamp.getTime().toString()
        ]);

        // Build tree
        this.currentValues = values;
        this.currentTree = StandardMerkleTree.of(
            this.currentValues,
            ['bytes32', 'uint256']
        );

        this.currentRoot = this.currentTree.root;
        this.currentVersion++;
        this.currentLeafCount = this.currentValues.length;
        this.isInitialized = true;

        // Update all proofs with new Merkle data
        for (let i = 0; i < proofs.length; i++) {
            const merkleProof = this.currentTree.getProof(i);
            await VerifiedProof.findByIdAndUpdate(proofs[i]._id, {
                merkleVersion: this.currentVersion,
                merkleLeafIndex: i,
                merkleProof: merkleProof,
                root: this.currentRoot
            });
        }

        // Save snapshot
        const snapshot = new TreeSnapshot({
            version: this.currentVersion,
            root: this.currentRoot,
            leafCount: this.currentLeafCount,
            treeJson: this.currentTree.dump(),
            values: [...this.currentValues],
            rebuiltFromDB: true,
            createdAt: new Date()
        });

        await snapshot.save();

        console.log(`✅ Tree rebuilt - Version: ${this.currentVersion}, Root: ${this.currentRoot}, Leaves: ${this.currentLeafCount}`);

        return {
            root: this.currentRoot,
            version: this.currentVersion,
            leafCount: this.currentLeafCount
        };
    }
}

module.exports = new MerkleTreeService();