circom ./circuits/zkpCircuit.circom \
--r1cs --wasm --sym \
-o ./Project_v1/ZKPFiles \
-l ./node_modules
snarkjs powersoftau new bn128 12 ./Project_v1/tau_files/pot12_0000.ptau
snarkjs powersoftau contribute \
./Project_v1/tau_files/pot12_0000.ptau \
./Project_v1/tau_files/pot12_0001.ptau \
--name="First contribution" \
-e="$(openssl rand -base64 20)"

snarkjs powersoftau prepare phase2 \
./Project_v1/tau_files/pot12_0001.ptau \
./Project_v1/tau_files/pot12_final.ptau

snarkjs powersoftau verify ./Project_v1/tau_files/pot12_final.ptau
snarkjs plonk setup ./Project_v1/ZKPFiles/zkpCircuit.r1cs ./Project_v1/tau_files/pot12_final.ptau ./Project_v1/tau_files/final.zkey