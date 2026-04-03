// models/TreeSnapshot.model.js
const mongoose = require('mongoose');

const treeSnapshotSchema = new mongoose.Schema({
    // Version tracking
    version: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },

    // Merkle tree data
    root: {
        type: String,
        required: true,
        validate: {
            validator: (v) => /^0x[a-fA-F0-9]{64}$/.test(v),
            message: 'Invalid root hash format'
        }
    },
    leafCount: {
        type: Number,
        required: true,
        min: 0
    },

    // Full tree dump from @openzeppelin/merkle-tree
    treeJson: {
        type: Object,
        required: true
    },

    // All leaf values in order
    values: {
        type: Array,
        default: []
    },

    // Added leaf info (for single additions)
    addedLeaf: {
        proofHash: String,
        leafValue: Array,
        leafHash: String,
        leafIndex: Number,
        proof: [String],
        metadata: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },

    // Added batch info (for batch additions)
    addedBatch: {
        count: Number,
        startIndex: Number,
        endIndex: Number,
        metadata: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },

    // Flags
    rebuiltFromDB: {
        type: Boolean,
        default: false
    },

    // Blockchain submission data
    submittedToChain: {
        type: Boolean,
        default: false
    },
    txHash: {
        type: String,
        default: null
    },
    blockNumber: {
        type: Number,
        default: null
    },
    submittedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Indexes
treeSnapshotSchema.index({ submittedToChain: 1 });
treeSnapshotSchema.index({ createdAt: -1 });
treeSnapshotSchema.index({ version: -1 });

// Methods
treeSnapshotSchema.methods.markAsSubmitted = async function (txHash, blockNumber) {
    this.submittedToChain = true;
    this.txHash = txHash;
    this.blockNumber = blockNumber;
    this.submittedAt = new Date();
    await this.save();
};

module.exports = mongoose.model('TreeSnapshot', treeSnapshotSchema);