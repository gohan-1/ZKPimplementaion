// models/credential.model.js
const mongoose = require('mongoose');
const validator = require('validator');
const { toJSON, paginate } = require('./plugins');

// Operator enum values (matches your Circom circuit)
const operators = {
    EQUAL: 0,
    GREATER_THAN: 1,
    LESS_THAN: 2,
};

const credentialSchema = mongoose.Schema(
    {
        // Core credential data (matches Circom circuit inputs)
        userID: {
            type: Number,
            required: true,
            index: true,
            validate(value) {
                if (!Number.isInteger(value) || value < 0) {
                    throw new Error('User ID must be a positive integer');
                }
            },
        },
        issuerID: {
            type: Number,
            required: true,
            index: true,
            validate(value) {
                if (!Number.isInteger(value) || value < 0) {
                    throw new Error('Issuer ID must be a positive integer');
                }
            },
        },
        credentialHash: {
            type: String,
            required: true,
            trim: true,
            validate(value) {
                if (!value.match(/^[0-9a-fA-F]+$/)) {
                    throw new Error('Credential hash must be a hex string');
                }
            },
        },

        // Claim validation data
        claimValue: {
            type: Number,
            required: true,
            validate(value) {
                if (typeof value !== 'number') {
                    throw new Error('Claim value must be a number');
                }
            },
        },
        requiredValue: {
            type: Number,
            required: true,
            validate(value) {
                if (typeof value !== 'number') {
                    throw new Error('Required value must be a number');
                }
            },
        },
        operator: {
            type: Number,
            required: true,
            enum: [operators.EQUAL, operators.GREATER_THAN, operators.LESS_THAN],
            default: operators.EQUAL,
        },

        // Merkle tree data
        merkleLeaf: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
            validate(value) {
                if (value && !value.match(/^0x[0-9a-fA-F]{64}$/)) {
                    throw new Error('Merkle leaf must be a 0x-prefixed 64-character hex string');
                }
            },
        },
        merkleProof: {
            type: [String],
            default: [],
            validate(value) {
                if (value.length > 0) {
                    for (const proof of value) {
                        if (!proof.match(/^0x[0-9a-fA-F]{64}$/)) {
                            throw new Error('Each merkle proof element must be a 0x-prefixed 64-character hex string');
                        }
                    }
                }
            },
        },
        merkleVersion: {
            type: Number,
            default: 0,
            min: 0,
        },
        batchId: {
            type: Number,
            min: 0,
        },

        // Status flags
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        isRevoked: {
            type: Boolean,
            default: false,
        },
        revokedAt: {
            type: Date,
            default: null,
        },
        revokeReason: {
            type: String,
            trim: true,
            maxlength: 500,
        },

        // Metadata
        metadata: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
            default: {},
        },
        issuedAt: {
            type: Date,
            default: Date.now,
        },
        expiresAt: {
            type: Date,
            default: null,
        },

        // For audit trail
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    {
        timestamps: true, // Adds createdAt & updatedAt automatically
    }
);

// ============================================
// Indexes for performance
// ============================================
credentialSchema.index({ userID: 1, issuerID: 1, isActive: 1 });
credentialSchema.index({ credentialHash: 1 });
credentialSchema.index({ merkleVersion: 1, batchId: 1 });
credentialSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired

// add plugin that converts mongoose to json
credentialSchema.plugin(toJSON);

/**
 * @typedef Credential
 */
const Credential = mongoose.model('Credential', credentialSchema);

module.exports = Credential;