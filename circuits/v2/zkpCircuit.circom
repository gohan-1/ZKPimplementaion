pragma circom 2.2.3;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/eddsaposeidon.circom";

// template IsZero() {
//     signal input in;
//     signal output out;
    
//     signal inv;
//     inv <== in != 0 ? 1/in : 0;
//     out <== 1 - in * inv;
// }

template AND(n) {
    signal input in[n];
    signal output out;
    
    // Calculate sum using linear combination
    signal sum;
    sum <== 0;
    
    // Use a different approach - create a new signal for each addition
    signal sums[n];
    sums[0] <== in[0];
    for (var i = 1; i < n; i++) {
        sums[i] <== sums[i-1] + in[i];
    }
    
    // Check if sum equals n
    component eq = IsEqual();
    eq.in[0] <== sums[n-1];
    eq.in[1] <== n;
    out <== eq.out;
}

template VerifyEdDSAPoseidon() {
    signal input message;
    signal input pubKeyX;
    signal input pubKeyY;
    signal input sigR8x;
    signal input sigR8y;
    signal input sigS;
    signal output isValid;
    
    component verifier = EdDSAPoseidonVerifier();
    verifier.enabled <== 1;
    verifier.Ax <== pubKeyX;
    verifier.Ay <== pubKeyY;
    verifier.R8x <== sigR8x;
    verifier.R8y <== sigR8y;
    verifier.S <== sigS;
    verifier.M <== message;
    
    isValid <== 1;
}


template MinimalCredentialProof() {
    signal input userID;
    signal input issuerID;
    signal input credentialHash;
    signal input claimValue;
    signal input requiredValue;
    signal input operator;
    
    signal input signatureR8x;
    signal input signatureR8y;
    signal input signatureS;
    signal input issuerPublicKeyX;
    signal input issuerPublicKeyY;
    
    signal output isValid;
    signal output nullifier;
    
    // 1. Signature verification
    component verifier = VerifyEdDSAPoseidon();
    verifier.message <== credentialHash;
    verifier.pubKeyX <== issuerPublicKeyX;
    verifier.pubKeyY <== issuerPublicKeyY;
    verifier.sigR8x <== signatureR8x;
    verifier.sigR8y <== signatureR8y;
    verifier.sigS <== signatureS;
    
   // 2. Credential binding
   component hashUser = Poseidon(2);
   hashUser.inputs[0] <== userID;
   hashUser.inputs[1] <== issuerID;
   
   component credentialCheck = IsEqual();
   credentialCheck.in[0] <== hashUser.out;
   credentialCheck.in[1] <== credentialHash;
   
   // 3. Operator constraints - use quadratic constraints only
   // Ensure operator is 0, 1, or 2 using quadratic constraints
   
   // Constraint 1: operator * (operator - 1) * (operator - 2) = 0
   // But we need to break it into quadratic constraints
   signal op_minus_1 <== operator - 1;
   signal op_minus_2 <== operator - 2;
   signal temp <== operator * op_minus_1;
   signal opCheck <== temp * op_minus_2;
   opCheck === 0;
   
   // 4. Comparison results
   component eq = IsEqual();
   eq.in[0] <== claimValue;
   eq.in[1] <== requiredValue;
   
   component gt = GreaterThan(32);
   gt.in[0] <== claimValue;
   gt.in[1] <== requiredValue;
   
   component lt = LessThan(32);
   lt.in[0] <== claimValue;
   lt.in[1] <== requiredValue;
   
   // 5. Select based on operator using arithmetic
   // Compute selection flags using quadratic constraints
   signal isOp0;
   signal isOp1;
   signal isOp2;
   
   // isOp0 = 1 when operator == 0, else 0
   // isOp0 = (1 - operator) * (1 - operator/2)? Actually use: (1 - operator) * (1 - operator/2)
   // But division not allowed. Better approach:
   component isOp0_check = IsEqual();
   isOp0_check.in[0] <== operator;
   isOp0_check.in[1] <== 0;
   isOp0 <== isOp0_check.out;
   
   component isOp1_check = IsEqual();
   isOp1_check.in[0] <== operator;
   isOp1_check.in[1] <== 1;
   isOp1 <== isOp1_check.out;
   
   component isOp2_check = IsEqual();
   isOp2_check.in[0] <== operator;
   isOp2_check.in[1] <== 2;
   isOp2 <== isOp2_check.out;
   
   // Ensure exactly one operator flag is 1
   signal opSum <== isOp0 + isOp1 + isOp2;
   opSum === 1;
   
   // Combine results using linear combination
   signal claimValid0 <== isOp0 * eq.out;
   signal claimValid1 <== isOp1 * gt.out;
   signal claimValid2 <== isOp2 * lt.out;
   signal claimValid <== claimValid0 + claimValid1 + claimValid2;
   
   // 6. Combine all checks using multiplication (quadratic constraint)
   signal temp1 <== verifier.isValid * credentialCheck.out;
   signal allValid <== temp1 * claimValid;
   isValid <== allValid;
   
   // 7. Nullifier
   component nullifierGen = Poseidon(2);
   nullifierGen.inputs[0] <== userID;
   nullifierGen.inputs[1] <== credentialHash;
   nullifier <== nullifierGen.out;
}

component main = MinimalCredentialProof();