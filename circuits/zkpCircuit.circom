pragma circom 2.2.3;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";
include "node_modules/circomlib-circom/circuits/babyjub.circom";
include "circomlib/circuits/eddsaposeidon.circom";


// AND component
template AND(n) {
    signal input in[n];
    signal output out;
    
    signal sum;
    sum <== 0;
    for (var i = 0; i < n; i++) {
        sum <== sum + in[i];
    }
    component eq = IsEqual();
    eq.in[0] <== sum;
    eq.in[1] <== n;
    out <== eq.out;
}

// Signature verification template using babyjubjub
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
    
    isValid <== verifier.out;
}

template MinimalCredentialProof() {
    // Inputs
    signal input userID;
    signal input issuerID;
    signal input credentialHash;
    signal input claimValue;
    signal input requiredValue;
    signal input operator;
    
    // Signature inputs
    signal input signatureR8x;
    signal input signatureR8y;
    signal input signatureS;
    signal input issuerPublicKeyX;
    signal input issuerPublicKeyY;
    
    // Outputs
    signal output isValid;
    signal output nullifier;
    
    // 1. Verify signature on credential hash
    component sigVerifier = VerifyEdDSAPoseidon();
    sigVerifier.message <== credentialHash;
    sigVerifier.pubKeyX <== issuerPublicKeyX;
    sigVerifier.pubKeyY <== issuerPublicKeyY;
    sigVerifier.sigR8x <== signatureR8x;
    sigVerifier.sigR8y <== signatureR8y;
    sigVerifier.sigS <== signatureS;
    
    // 2. Verify credential binding (userID + issuerID -> credentialHash)
    component hashUser = Poseidon(2);
    hashUser.inputs[0] <== userID;
    hashUser.inputs[1] <== issuerID;
    
    component credentialCheck = IsEqual();
    credentialCheck.in[0] <== hashUser.out;
    credentialCheck.in[1] <== credentialHash;
    
    // 3. Compare claim value with required value based on operator
    component eq = IsEqual();
    eq.in[0] <== claimValue;
    eq.in[1] <== requiredValue;
    
    component gt = GreaterThan(32);
    gt.in[0] <== claimValue;
    gt.in[1] <== requiredValue;
    
    component lt = LessThan(32);
    lt.in[0] <== claimValue;
    lt.in[1] <== requiredValue;
    
    // 4. Select result based on operator
    component isOp0 = IsEqual();
    isOp0.in[0] <== operator;
    isOp0.in[1] <== 0;
    
    component isOp1 = IsEqual();
    isOp1.in[0] <== operator;
    isOp1.in[1] <== 1;
    
    component isOp2 = IsEqual();
    isOp2.in[0] <== operator;
    isOp2.in[1] <== 2;
    
    // Ensure operator is valid (0, 1, or 2)
    signal opSum <== isOp0.out + isOp1.out + isOp2.out;
    opSum === 1;
    
    // Combine results: claimValid = (op==0 ? eq : (op==1 ? gt : lt))
    signal claimValid0 <== isOp0.out * eq.out;
    signal claimValid1 <== isOp1.out * gt.out;
    signal claimValid2 <== isOp2.out * lt.out;
    signal claimValid <== claimValid0 + claimValid1 + claimValid2;
    
    // 5. All checks must pass
    component allValid = AND(3);
    allValid.in[0] <== sigVerifier.isValid;
    allValid.in[1] <== credentialCheck.out;
    allValid.in[2] <== claimValid;
    isValid <== allValid.out;
    
    // 6. Generate nullifier
    component nullifierGen = Poseidon(2);
    nullifierGen.inputs[0] <== userID;
    nullifierGen.inputs[1] <== credentialHash;
    nullifier <== nullifierGen.out;
}

component main = MinimalCredentialProof();