const fs = require('fs');
const { buildPoseidon } = require('circomlibjs');
const { PublicKey, PrivateKey } = require('babyjubjub');
const path = require('path')


const snarkjs = require('snarkjs');
const crypto = require('crypto');

class CircuitInputGenerator {
    constructor() {
        this.poseidon = null;
        // this.babyjub = null;
    }

    async init() {

        // Initialize cryptographic primitives
        this.poseidon = await buildPoseidon();
        // this.babyjub = await snarkjs.babyJub;
    }

    // Convert number to field element string
    toField(num) {
        return num.toString();
    }

    toFieldString(value) {
        // Handle BigInt
        if (typeof value === 'bigint') {
            return value.toString(10);  // Decimal string
        }
        // Handle object with n property (from circomlibjs)
        if (value && typeof value === 'object' && 'n' in value) {
            return value.n.toString(10);
        }
        // Handle regular numbers
        if (typeof value === 'number') {
            return Math.floor(value).toString(10);
        }
        // Handle strings
        if (typeof value === 'string') {
            // If it's a hex string starting with 0x, convert to decimal
            if (value.startsWith('0x')) {
                return BigInt(value).toString(10);
            }
            return value;
        }
        return value.toString(10);
    }
    // Generate random field element
    randomField() {
        const randomBytes = crypto.randomBytes(31);
        return '0x' + randomBytes.toString('hex');
    }

    // Compute Poseidon hash
    async poseidonHash(inputs) {
        const hash = this.poseidon.F.toString(
            this.poseidon(inputs.map(i => BigInt(i)))
        );
        return hash;
    }

    // Generate a credential hash (matches circuit)
    async generateCredentialHash(userID, issuerID) {
        // This must match the circuit's hash calculation
        // hashUser = Poseidon(userID, issuerID)
        return await this.poseidonHash([userID, issuerID]);
    }

    // Generate a valid credential
    async generateCredential(userID, issuerID, claimValue, operator, requiredValue) {
        // Calculate credential hash
        const credentialHash = await this.generateCredentialHash(userID, issuerID);

        // Generate key pair
        let sk = PrivateKey.getRandObj().field;
        let privateKey = new PrivateKey(sk);
        let publicKey = PublicKey.fromPrivate(privateKey);

        // Convert public key coordinates to flat decimal strings
        const pubKeyX = this.toFieldString(publicKey.p.x);
        const pubKeyY = this.toFieldString(publicKey.p.y);

        console.log("Generated public key X:", pubKeyX);
        console.log("Generated public key Y:", pubKeyY);
        // Generate a key pair for the issuer
        // const privateKey = this.babyjub.randomPrivKey();

        // const publicKey = this.babyjub.privToPub(privateKey);

        // For demo, create a simple signature (in production, use real signing)
        const signature = {
            R8x: "1",
            R8y: "1",
            S: "1"
        };

        return {
            credentialHash,
            issuerPublicKey: {
                x: pubKeyX,
                y: pubKeyY
            },
            signature,
            claimValue,
            requiredValue,
            operator
        };
    }

    // Generate nullifier (must match circuit)
    async generateNullifier(userID, credentialHash) {
        // nullifier = Poseidon(userID, credentialHash)
        return await this.poseidonHash([userID, credentialHash]);
    }

    // Create complete circuit inputs
    async createInputs(userData) {
        const {
            userID = 123456789,
            issuerID = 987654321,
            claimValue = 25,
            requiredValue = 18,
            operator = 1  // 0: equals, 1: greater than, 2: less than
        } = userData;

        // Generate credential
        const credential = await this.generateCredential(
            userID, issuerID, claimValue, operator, requiredValue
        );

        // Generate nullifier for verification
        const nullifier = await this.generateNullifier(userID, credential.credentialHash);

        // Build inputs
        const inputs = {
            // Identity
            userID: this.toField(userID),
            issuerID: this.toField(issuerID),

            // Credential
            credentialHash: credential.credentialHash,

            // Query
            claimValue: this.toField(claimValue),
            requiredValue: this.toField(requiredValue),
            operator: this.toField(operator),

            // Signature (simplified for demo)
            signatureR8x: credential.signature.R8x,
            signatureR8y: credential.signature.R8y,
            signatureS: credential.signature.S,

            // Issuer public key
            issuerPublicKeyX: credential.issuerPublicKey.x,
            issuerPublicKeyY: credential.issuerPublicKey.y
        };

        return {
            inputs,
            metadata: {
                expectedNullifier: nullifier,
                expectedIsValid: 1  // Should be valid if all inputs correct
            }
        };
    }

    // Save inputs to file
    async saveInputs(inputs, filename = 'input.json') {

        const witnessDir = path.join(__dirname, '../inputGenerator');
        const witnessFile = path.join(witnessDir, filename);
        fs.writeFileSync(witnessFile, JSON.stringify(inputs, null, 2));
        console.log(`✅ Inputs saved to ${filename}`);
        return filename;
    }

    // Generate test vectors for different scenarios
    async generateTestVectors() {
        console.log("Generating test vectors...\n");

        // Scenario 1: Age verification - valid (25 >= 18)
        const scenario1 = await this.createInputs({
            userID: 123456789,
            issuerID: 987654321,
            claimValue: 25,
            requiredValue: 18,
            operator: 1  // greater than
        });
        await this.saveInputs(scenario1.inputs, 'age_valid_gt.json');
        console.log("✓ Age verification (25 > 18) - Should be VALID");

        // Scenario 2: Age verification - valid (18 == 18)
        const scenario2 = await this.createInputs({
            userID: 123456789,
            issuerID: 987654321,
            claimValue: 18,
            requiredValue: 18,
            operator: 0  // equals
        });
        await this.saveInputs(scenario2.inputs, 'age_valid_eq.json');
        console.log("✓ Age verification (18 == 18) - Should be VALID");

        // Scenario 3: Age verification - valid (15 < 18)
        const scenario3 = await this.createInputs({
            userID: 123456789,
            issuerID: 987654321,
            claimValue: 15,
            requiredValue: 18,
            operator: 2  // less than
        });
        await this.saveInputs(scenario3.inputs, 'age_valid_lt.json');
        console.log("✓ Age verification (15 < 18) - Should be VALID");

        // Scenario 4: Age verification - invalid (16 >= 18) with wrong operator
        const scenario4 = await this.createInputs({
            userID: 123456789,
            issuerID: 987654321,
            claimValue: 16,
            requiredValue: 18,
            operator: 1  // greater than - should fail
        });
        await this.saveInputs(scenario4.inputs, 'age_invalid_gt.json');
        console.log("⚠️ Age verification (16 > 18) - Should be INVALID");

        // Scenario 5: Different user - should fail credential binding
        const scenario5 = await this.createInputs({
            userID: 999999999,  // Different user
            issuerID: 987654321,
            claimValue: 25,
            requiredValue: 18,
            operator: 1
        });
        await this.saveInputs(scenario5.inputs, 'wrong_user.json');
        console.log("⚠️ Wrong user - Should be INVALID (credential binding fails)");

        console.log("\n✅ All test vectors generated!");
    }
}

// Main execution
async function main() {
    const generator = new CircuitInputGenerator();
    await generator.init();

    // Generate test vectors
    await generator.generateTestVectors();

    // Generate a single custom input
    console.log("\n📝 Generating custom input...");
    const customInput = await generator.createInputs({
        userID: 987654321,
        issuerID: 123456789,
        claimValue: 30,
        requiredValue: 21,
        operator: 1
    });

    await generator.saveInputs(customInput.inputs, 'custom_input.json');

    // Display the input structure
    console.log("\n📋 Input JSON Structure:");
    console.log(JSON.stringify(customInput.inputs, null, 2));

    // Show how to use with snarkjs
    console.log("\n🚀 To generate witness:");
    console.log("snarkjs wtns calculate circuit.wasm input.json witness.wtns");

    console.log("\n🔍 To verify proof:");
    console.log("snarkjs groth16 prove circuit_final.zkey witness.wtns proof.json public.json");
    console.log("snarkjs groth16 verify verification_key.json public.json proof.json");
}

// Run
main().catch(console.error);