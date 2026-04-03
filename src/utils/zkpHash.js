// utils/zkpHash.util.js
const { ethers } = require('ethers');
const crypto = require('crypto');

/**
 * Extract unique identifier from Groth16 proof
 * Creates a deterministic hash from the proof
 */
class ZKPProofHasher {

    /**
     * Hash the entire proof JSON
     * @param {Object} proof - Groth16 proof object
     @returns {string} Keccak256 hash of the proof
     */
    static hashFullProof(proof) {
        // Stringify proof deterministically
        const proofString = JSON.stringify(proof, Object.keys(proof).sort());
        const proofBuffer = Buffer.from(proofString, 'utf8');
        return ethers.keccak256(proofBuffer);
    }

    /**
     * Extract and hash only pi_a values (first proof element)
     * @param {Object} proof - Groth16 proof object
     * @returns {string} Hash of pi_a values
     */
    static hashPiA(proof) {
        const piA = proof.pi_a || [];
        const concatenated = piA.slice(0, 2).join('');
        return ethers.keccak256(Buffer.from(concatenated, 'utf8'));
    }

    /**
     * Hash all proof components into a single hash
     * @param {Object} proof - Groth16 proof object
     * @returns {string} Combined hash
     */
    static hashProofComponents(proof) {
        // Extract all numeric values from proof
        const components = [];

        // Add pi_a (excluding last element which is often 1)
        if (proof.pi_a) {
            components.push(...proof.pi_a.slice(0, 2));
        }

        // Add pi_b (all nested values)
        if (proof.pi_b) {
            for (const pair of proof.pi_b) {
                if (Array.isArray(pair)) {
                    components.push(...pair.slice(0, 2));
                } else {
                    components.push(pair);
                }
            }
        }

        // Add pi_c
        if (proof.pi_c) {
            components.push(...proof.pi_c.slice(0, 2));
        }

        // Hash all components together
        const concatenated = components.join('');
        return ethers.keccak256(Buffer.from(concatenated, 'utf8'));
    }

    /**
     * Create a commitment from public inputs + proof
     * @param {Object} proof - Groth16 proof
     * @param {Array} publicSignals - Public inputs from ZKP
     * @returns {string} Commitment hash
     */
    static createCommitment(proof, publicSignals = []) {
        const proofHash = this.hashProofComponents(proof);

        if (publicSignals.length === 0) {
            return proofHash;
        }

        // Combine proof hash with public signals
        const encoded = ethers.solidityPacked(
            ['bytes32', 'uint256[]'],
            [proofHash, publicSignals]
        );

        return ethers.keccak256(encoded);
    }

    /**
     * Extract nullifier from public signals (if your circuit outputs it)
     * @param {Array} publicSignals - Public signals from ZKP
     * @returns {string|null} Nullifier value
     */
    static extractNullifier(publicSignals) {
        // Assuming nullifier is the first public signal
        // Adjust based on your circuit's output order
        if (publicSignals && publicSignals.length > 0) {
            return publicSignals[0].toString();
        }
        return null;
    }
}

module.exports = ZKPProofHasher;