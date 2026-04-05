
// Operator enum (matches Circom circuit)
const OPERATORS = {
    EQUAL: 0,
    GREATER_THAN: 1,
    LESS_THAN: 2,
};

// Credential status
const CREDENTIAL_STATUS = {
    ACTIVE: 'active',
    REVOKED: 'revoked',
    EXPIRED: 'expired',
    PENDING: 'pending',
};

// Merkle tree constants
const MERKLE_CONSTANTS = {
    TREE_HEIGHT: 20,
    ZERO_HASH: '0x0000000000000000000000000000000000000000000000000000000000000000',
    MAX_LEAVES: 1048576, // 2^20
};

// API response messages
const MESSAGES = {
    CREDENTIAL: {
        CREATED: 'Credential created successfully',
        FETCHED: 'Credential fetched successfully',
        UPDATED: 'Credential updated successfully',
        REVOKED: 'Credential revoked successfully',
        REACTIVATED: 'Credential reactivated successfully',
        NOT_FOUND: 'Credential not found',
        ALREADY_EXISTS: 'Credential already exists',
        EXPIRED: 'Credential has expired',
        INVALID_PROOF: 'Invalid Merkle proof',
    },
    MERKLE: {
        TREE_BUILT: 'Merkle tree built successfully',
        ROOT_FETCHED: 'Root fetched successfully',
        PROOF_GENERATED: 'Proof generated successfully',
    },
};

module.exports = {
    OPERATORS,
    CREDENTIAL_STATUS,
    MERKLE_CONSTANTS,
    MESSAGES,
};