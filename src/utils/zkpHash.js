// utils/zkpHash.util.js
const { ethers } = require('ethers');

/**
 * ZKPProofHasher
 * --------------
 * Deterministic hashing utilities for Groth16 proofs.
 * hashFullProof() is the canonical function used by MerkleTreeService.
 */
class ZKPProofHasher {
    /**
     * Hash the full proof JSON deterministically.
     * Keys are sorted so field-order differences produce the same hash.
     * @param {Object} proof - Groth16 proof
     * @returns {string} 0x-prefixed keccak256 bytes32
     */
    static hashFullProof(proof) {
        const proofString = JSON.stringify(proof, Object.keys(proof).sort());
        return ethers.keccak256(Buffer.from(proofString, 'utf8'));
    }

    /**
     * Hash only pi_a (first two elements).
     */
    static hashPiA(proof) {
        const piA = (proof.pi_a || []).slice(0, 2).join('');
        return ethers.keccak256(Buffer.from(piA, 'utf8'));
    }

    /**
     * Hash all numeric components of the proof.
     */
    static hashProofComponents(proof) {
        const parts = [];
        if (proof.pi_a) parts.push(...proof.pi_a.slice(0, 2));
        if (proof.pi_b) {
            for (const pair of proof.pi_b) {
                if (Array.isArray(pair)) parts.push(...pair.slice(0, 2));
                else parts.push(pair);
            }
        }
        if (proof.pi_c) parts.push(...proof.pi_c.slice(0, 2));
        return ethers.keccak256(Buffer.from(parts.join(''), 'utf8'));
    }
}

module.exports = ZKPProofHasher;