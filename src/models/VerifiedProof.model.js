// models/verifiedProof.model.js
//
// One document per inserted leaf.
// The merkleProof field stores everything needed for trustless verification:
//   { root, leaf, siblings, pathIndices, leafIndex }
//
// A holder of this record + the on-chain root can verify membership
// without trusting the server at all.

'use strict';

const mongoose = require('mongoose');

const merkleProofSchema = new mongoose.Schema({
    root: { type: String, required: true },  // root at time of insertion
    leaf: { type: String, required: true },  // leaf value as hex bigint
    siblings: { type: [String], required: true },// sibling hashes (hex bigints)
    pathIndices: { type: [Number], required: true },// 0=left, 1=right at each level
    leafIndex: { type: Number, required: true }
}, { _id: false });

const verifiedProofSchema = new mongoose.Schema({
    // ── Identity ─────────────────────────────────────────────────────────────
    proofHash: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // ── Merkle position ───────────────────────────────────────────────────────
    merkleVersion: { type: Number, required: true },
    merkleLeafIndex: { type: Number, required: true, index: true },
    merkleProof: { type: merkleProofSchema, required: true },
    root: { type: String, required: true },

    // ── Original Groth16 proof (optional — may be omitted for hash-only inserts)
    originalProof: { type: mongoose.Schema.Types.Mixed, default: null },

    timestamp: { type: Date, default: Date.now }
}, {
    timestamps: true  // adds createdAt, updatedAt automatically
});

// Index for pagination by insertion order
verifiedProofSchema.index({ merkleLeafIndex: 1 });
verifiedProofSchema.index({ merkleVersion: 1 });

module.exports = mongoose.model('VerifiedProof', verifiedProofSchema);