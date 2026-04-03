    pragma circom 2.2.3;

    include "circomlib/circuits/poseidon.circom";
    include "circomlib/circuits/comparators.circom";
    include "circomlib/circuits/bitify.circom";

    // AND template for combining conditions
    template AND(n) {
        signal input in[n];
        signal output out;
        
        signal sums[n];
        sums[0] <== in[0];
        for (var i = 1; i < n; i++) {
            sums[i] <== sums[i-1] + in[i];
        }
        
        component eq = IsEqual();
        eq.in[0] <== sums[n-1];
        eq.in[1] <== n;
        out <== eq.out;
    }

    template MinimalCredentialProof() {
        // Inputs - removed signature and public key fields
        signal input userID;
        signal input issuerID;
        signal input credentialHash;
        signal input claimValue;
        signal input requiredValue;
        signal input operator;
        
        // Outputs
        signal output isValid;
        signal output nullifier;
        
        // 1. Credential binding verification
        // Hash userID and issuerID to check against credentialHash
        component hashUser = Poseidon(2);
        hashUser.inputs[0] <== userID;
        hashUser.inputs[1] <== issuerID;
        
        component credentialCheck = IsEqual();
        credentialCheck.in[0] <== hashUser.out;
        credentialCheck.in[1] <== credentialHash;
        
        // 2. Comparison results based on operator
        component eq = IsEqual();
        eq.in[0] <== claimValue;
        eq.in[1] <== requiredValue;
        
        component gt = GreaterThan(32);
        gt.in[0] <== claimValue;
        gt.in[1] <== requiredValue;
        
        component lt = LessThan(32);
        lt.in[0] <== claimValue;
        lt.in[1] <== requiredValue;
        
        // 3. Select based on operator
        component isOp0 = IsEqual();
        isOp0.in[0] <== operator;
        isOp0.in[1] <== 0;  // operator 0 means "equal to"
        
        component isOp1 = IsEqual();
        isOp1.in[0] <== operator;
        isOp1.in[1] <== 1;  // operator 1 means "greater than"
        
        component isOp2 = IsEqual();
        isOp2.in[0] <== operator;
        isOp2.in[1] <== 2;  // operator 2 means "less than"
        
        // Ensure operator is valid (0, 1, or 2)
        signal opSum <== isOp0.out + isOp1.out + isOp2.out;
        opSum === 1;
        
        // Combine results using linear combination
        signal claimValid0 <== isOp0.out * eq.out;
        signal claimValid1 <== isOp1.out * gt.out;
        signal claimValid2 <== isOp2.out * lt.out;
        signal claimValid <== claimValid0 + claimValid1 + claimValid2;
        
        // 4. Final validity check
        // Only need credential binding and claim validation
        component allValid = AND(2);
        allValid.in[0] <== credentialCheck.out;
        allValid.in[1] <== claimValid;
        isValid <== allValid.out;
        
        // 5. Nullifier generation
        component nullifierGen = Poseidon(2);
        nullifierGen.inputs[0] <== userID;
        nullifierGen.inputs[1] <== credentialHash;
        nullifier <== nullifierGen.out;
    }

    // Main component
    component main = MinimalCredentialProof();