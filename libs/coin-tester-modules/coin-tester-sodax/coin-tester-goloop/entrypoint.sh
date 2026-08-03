#!/usr/bin/env bash
set -euo pipefail

GOD_ADDRESS="${GOD_ADDRESS:?GOD_ADDRESS must be set (the hx… address that holds the genesis supply)}"
GENESIS_BALANCE="${GENESIS_BALANCE:?GENESIS_BALANCE must be set (hex loop)}"
STEP_PRICE="${STEP_PRICE:?STEP_PRICE must be set (hex loop)}"
DEV_ADDRESS="${DEV_ADDRESS:-}"

export GOLOOP_NODE_DIR=/goloop/data
export GOLOOP_NODE_SOCK=/goloop/data/cli.sock
export GOLOOP_RPC_ADDR=:9080
export GOLOOP_P2P=0.0.0.0:8080

# The base image sets GOLOOP_CONFIG and GOLOOP_KEY_SECRET to paths under
# /goloop/config, a directory this entrypoint never populates. `goloop server
# start` fails outright if GOLOOP_CONFIG points at a missing file, so the node
# runs off its CLI flags and defaults instead. GOLOOP_KEY_STORE and
# GOLOOP_KEY_PASSWORD are overridden below rather than unset: the running
# node's wallet must be the same key that signed the genesis validator list,
# or consensus never proposes a block past height 0.
unset GOLOOP_CONFIG GOLOOP_KEY_SECRET

WORK=/goloop/work
mkdir -p "$WORK" "$GOLOOP_NODE_DIR"
cd "$WORK"

KEYSTORE="$WORK/keystore.json"
KEYSTORE_PASSWORD=gochain
goloop ks gen -o "$KEYSTORE" -p "$KEYSTORE_PASSWORD"

export GOLOOP_KEY_STORE="$KEYSTORE"
export GOLOOP_KEY_PASSWORD="$KEYSTORE_PASSWORD"

# --fee icon writes the full ICON step-cost table. It leaves revision at 0x8 and
# chain.fee.stepPrice at 0x0.
goloop gn gen --fee icon -g "$GOD_ADDRESS" -o genesis.json "$KEYSTORE"

# goloop reads nid from the TOP LEVEL of the genesis file. A nid under `chain`
# has no effect, and goloop then derives the nid from the genesis hash.
jq \
  --arg bal "$GENESIS_BALANCE" \
  --arg price "$STEP_PRICE" '
    .nid = "0x1"
  | del(.chain.nid)
  | .chain.fee.stepPrice = $price
  | (.accounts[] | select(.name == "god") | .balance) = $bal
' genesis.json > genesis.patched.json

if [ -n "$DEV_ADDRESS" ]; then
  jq --arg dev "$DEV_ADDRESS" --arg bal "$GENESIS_BALANCE" \
    '.accounts += [{name: "dev", address: $dev, balance: $bal}]' \
    genesis.patched.json > genesis.dev.json
  mv genesis.dev.json genesis.patched.json
fi

mv genesis.patched.json genesis.json

echo "--- genesis summary ---"
jq '{nid: .nid, stepPrice: .chain.fee.stepPrice, accounts: .accounts}' genesis.json
echo "-----------------------"

goloop gs gen -i . -o gs.zip

goloop server start &
SERVER_PID=$!

for _ in $(seq 1 60); do
  [ -S "$GOLOOP_NODE_SOCK" ] && break
  sleep 0.5
done
[ -S "$GOLOOP_NODE_SOCK" ] || {
  echo "goloop server did not open $GOLOOP_NODE_SOCK" >&2
  exit 1
}

goloop chain join --genesis gs.zip --channel icon --platform icon --auto_start

# --auto_start above only persists the chain's autoStart config for its next
# restart; the chain stays in the "stopped" state right after join.
goloop chain start icon

wait "$SERVER_PID"
