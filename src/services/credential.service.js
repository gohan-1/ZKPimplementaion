// services/credential.service.js
const Credential = require('../models/credential.model');
const merkleTreeService = require('./merkleTree.service');
const { poseidonHash, computeMerkleLeaf } = require('../utils/hash.util');
const { OPERATORS } = require('../utils/constants');

class CredentialService {
    /**
     * Create new credential
     * @param {Object} credentialData - Credential data
     * @param {string} userId - User ID creating this
     * @returns {Promise<Object>}
     */
    async createCredential(credentialData, userId) {
        // Compute credentialHash using Poseidon (matches circuit)
        const credentialHash = await poseidonHash([
            credentialData.userID,
            credentialData.issuerID,
        ]);

        // Check if already exists
        const exists = await Credential.isCredentialExists(
            credentialData.userID,
            credentialData.issuerID
        );

        if (exists) {
            throw new Error('Credential already exists for this user and issuer');
        }

        const credential = new Credential({
            ...credentialData,
            credentialHash,
            createdBy: userId,
        });

        await credential.save();

        // Rebuild Merkle tree with new credential
        await merkleTreeService.buildTreeFromDB();

        return credential;
    }

    /**
     * Get credential by ID
     * @param {string} credentialId - Credential ID
     * @returns {Promise<Object>}
     */
    async getCredentialById(credentialId) {
        const credential = await Credential.findById(credentialId)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email');

        if (!credential) {
            throw new Error('Credential not found');
        }

        return credential;
    }

    /**
     * Get credential with proof for verification
     * @param {number} userID - User ID
     * @param {number} issuerID - Issuer ID
     * @returns {Promise<Object>}
     */
    async getCredentialWithProof(userID, issuerID) {
        const credential = await Credential.findOne({
            userID,
            issuerID,
            isActive: true,
            isRevoked: false,
        });

        if (!credential) {
            throw new Error('Credential not found');
        }

        if (credential.isExpired()) {
            throw new Error('Credential has expired');
        }

        // Get Merkle proof
        const proofData = await merkleTreeService.getProofForCredential(credential._id);

        return {
            userID: credential.userID,
            issuerID: credential.issuerID,
            credentialHash: credential.credentialHash,
            claimValue: credential.claimValue,
            requiredValue: credential.requiredValue,
            operator: credential.operator,
            merkleProof: proofData.proof,
            merkleLeaf: proofData.leaf,
            merkleVersion: proofData.version,
        };
    }

    /**
     * Get all credentials for a user
     * @param {number} userID - User ID
     * @param {Object} options - Pagination options
     * @returns {Promise<Object>}
     */
    async getUserCredentials(userID, options = {}) {
        const { page = 1, limit = 10, includeRevoked = false } = options;

        const query = { userID, isActive: true };
        if (!includeRevoked) {
            query.isRevoked = false;
        }

        const credentials = await Credential.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const total = await Credential.countDocuments(query);

        return {
            credentials,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Revoke credential
     * @param {string} credentialId - Credential ID
     * @param {string} reason - Revocation reason
     * @param {string} revokedBy - User ID revoking
     * @returns {Promise<Object>}
     */
    async revokeCredential(credentialId, reason, revokedBy) {
        const credential = await Credential.findById(credentialId);

        if (!credential) {
            throw new Error('Credential not found');
        }

        await credential.revoke(reason, revokedBy);

        // Rebuild Merkle tree (remove revoked credential)
        await merkleTreeService.buildTreeFromDB();

        return credential;
    }

    /**
     * Reactivate credential
     * @param {string} credentialId - Credential ID
     * @param {string} updatedBy - User ID reactivating
     * @returns {Promise<Object>}
     */
    async reactivateCredential(credentialId, updatedBy) {
        const credential = await Credential.findById(credentialId);

        if (!credential) {
            throw new Error('Credential not found');
        }

        await credential.reactivate(updatedBy);

        // Rebuild Merkle tree (add back credential)
        await merkleTreeService.buildTreeFromDB();

        return credential;
    }

    /**
     * Get all credentials by batch
     * @param {number} batchId - Batch ID
     * @returns {Promise<Array>}
     */
    async getCredentialsByBatch(batchId) {
        return Credential.getBatchCredentials(batchId);
    }

    /**
     * Get credential statistics
     * @returns {Promise<Object>}
     */
    async getStatistics() {
        const total = await Credential.countDocuments();
        const active = await Credential.countDocuments({ isActive: true, isRevoked: false });
        const revoked = await Credential.countDocuments({ isRevoked: true });
        const expired = await Credential.countDocuments({
            expiresAt: { $lt: new Date() },
            isActive: true,
        });

        return {
            total,
            active,
            revoked,
            expired,
            merkleRoot: merkleTreeService.getCurrentRoot(),
        };
    }
}

module.exports = new CredentialService();