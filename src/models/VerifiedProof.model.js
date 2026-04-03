// models/VerifiedProof.model.js
const mongoose = require('mongoose');

const verifiedProofSchema = new mongoose.Schema({
    // Proof hash (commitment)
    proofHash: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // Original proof object
    originalProof: {
        type: Object,
        required: true
    },

    // Nullifier (if extracted from proof)
    nullifier: {
        type: String,
        default: null,
        index: true
    },

    // Credential metadata
    userID: {
        type: Number,
        default: null,
        index: true
    },
    issuerID: {
        type: Number,
        default: null,
        index: true
    },

    // Merkle tree data
    merkleVersion: {
        type: Number,
        default: -1,
        index: true
    },
    merkleLeafIndex: {
        type: Number,
        default: -1
    },
    merkleProof: {
        type: [String],
        default: []
    },
    root: {
        type: String,
        default: null
    },

    // Public signals from ZKP (optional)
    publicSignals: {
        type: [String],
        default: []
    },

    // Additional metadata
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // Verification stats
    verifiedCount: {
        type: Number,
        default: 0
    },
    lastVerifiedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Compound indexes
verifiedProofSchema.index({ userID: 1, issuerID: 1 });
verifiedProofSchema.index({ merkleVersion: 1, merkleLeafIndex: 1 });
verifiedProofSchema.index({ createdAt: -1 });

// Methods
verifiedProofSchema.methods.incrementVerifiedCount = async function () {
    this.verifiedCount++;
    this.lastVerifiedAt = new Date();
    await this.save();
};

verifiedProofSchema.methods.updateMerkleData = async function (version, leafIndex, proof, root) {
    this.merkleVersion = version;
    this.merkleLeafIndex = leafIndex;
    this.merkleProof = proof;
    this.root = root;
    await this.save();
};

// Static methods
verifiedProofSchema.statics.findByProofHash = async function (proofHash) {
    return this.findOne({ proofHash: proofHash });
};

verifiedProofSchema.statics.findByUser = async function (userID, issuerID) {
    return this.findOne({ userID: userID, issuerID: issuerID })
        .sort({ merkleVersion: -1 });
};

module.exports = mongoose.model('VerifiedProof', verifiedProofSchema);