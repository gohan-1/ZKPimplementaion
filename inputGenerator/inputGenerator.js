const fs = require('fs');
const crypto = require('crypto');
const { buildPoseidon } = require('circomlibjs');
const {
    derivePublicKey,
    signMessage,
    verifySignature,
    deriveSecretScalar,
    packPublicKey,
    unpackPublicKey
} = require('@zk-kit/eddsa-poseidon');
const path = require('path')
class CircuitInputGenerator {
    constructor() {
        this.poseidon = null;
    }

    async init() {
        this.poseidon = await buildPoseidon();
    }

    toField(num) {
        return num.toString();
    }

    randomField() {
        const randomBytes = crypto.randomBytes(31);
        return '0x' + randomBytes.toString('hex');
    }

    async poseidonHash(inputs) {
        const hash = this.poseidon.F.toString(
            this.poseidon(inputs.map(i => BigInt(i)))
        );
        return hash;
    }

    async generateCredentialHash(userID, issuerID) {
        return await this.poseidonHash([userID, issuerID]);
    }

    async generateCredential(userID, issuerID, claimValue, operator, requiredValue) {
        const credentialHash = await this.generateCredentialHash(userID, issuerID);

        // Use a random 32-byte private key
        const privKey = crypto.randomBytes(32).toString('hex');

        // Derive public key
        const pubKey = derivePublicKey(privKey);

        // Sign credentialHash (as BigInt)
        const sig = signMessage(privKey, BigInt(credentialHash));

        return {
            credentialHash,
            issuerPublicKey: {
                x: pubKey[0].toString(),
                y: pubKey[1].toString()
            },
            signature: {
                R8x: sig.R8[0].toString(),
                R8y: sig.R8[1].toString(),
                S: sig.S.toString()
            },
            claimValue,
            requiredValue,
            operator
        };
    }

    async generateNullifier(userID, credentialHash) {
        return await this.poseidonHash([userID, credentialHash]);
    }

    async createInputs(userData) {
        const {
            userID = 123456789,
            issuerID = 987654321,
            claimValue = 25,
            requiredValue = 18,
            operator = 1
        } = userData;

        const credential = await this.generateCredential(
            userID, issuerID, claimValue, operator, requiredValue
        );

        const nullifier = await this.generateNullifier(userID, credential.credentialHash);

        const inputs = {
            userID: this.toField(userID),
            issuerID: this.toField(issuerID),
            credentialHash: credential.credentialHash,
            claimValue: this.toField(claimValue),
            requiredValue: this.toField(requiredValue),
            operator: this.toField(operator),
            signatureR8x: credential.signature.R8x,
            signatureR8y: credential.signature.R8y,
            signatureS: credential.signature.S,
            issuerPublicKeyX: credential.issuerPublicKey.x,
            issuerPublicKeyY: credential.issuerPublicKey.y
        };

        return {
            inputs,
            metadata: {
                expectedNullifier: nullifier,
                expectedIsValid: 1
            }
        };
    }

    async saveInputs(inputs, filename = 'input.json') {


        const witnessDir = path.join(__dirname, '../inputGenerator');
        const witnessFile = path.join(witnessDir, filename);
        fs.writeFileSync(witnessFile, JSON.stringify(inputs, null, 2));
        console.log(`✅ Inputs saved to ${filename}`);
        return filename;
    }

    async generateTestVectors() {
        console.log("Generating test vectors...\n");

        const scenarios = [
            { userID: 123456789, claimValue: 25, requiredValue: 18, operator: 1, file: 'age_valid_gt.json' },
            { userID: 123456789, claimValue: 18, requiredValue: 18, operator: 0, file: 'age_valid_eq.json' },
            { userID: 123456789, claimValue: 15, requiredValue: 18, operator: 2, file: 'age_valid_lt.json' },
            { userID: 123456789, claimValue: 16, requiredValue: 18, operator: 1, file: 'age_invalid_gt.json' },
            { userID: 999999999, claimValue: 25, requiredValue: 18, operator: 1, file: 'wrong_user.json' }
        ];

        for (let s of scenarios) {
            const scenario = await this.createInputs({
                userID: s.userID,
                issuerID: 987654321,
                claimValue: s.claimValue,
                requiredValue: s.requiredValue,
                operator: s.operator
            });
            await this.saveInputs(scenario.inputs, s.file);
            console.log(`✓ Scenario ${s.file} generated`);
        }

        console.log("\n✅ All test vectors generated!");
    }
}

// Main
(async () => {
    const generator = new CircuitInputGenerator();
    await generator.init();

    await generator.generateTestVectors();

    const customInput = await generator.createInputs({
        userID: 987654321,
        issuerID: 123456789,
        claimValue: 30,
        requiredValue: 21,
        operator: 1
    });

    await generator.saveInputs(customInput.inputs, 'custom_input.json');

    console.log("\n📋 Example input JSON:");
    console.log(JSON.stringify(customInput.inputs, null, 2));
})();