#!/usr/bin/env bash
set -euo pipefail

GOD_ADDRESS="${GOD_ADDRESS:?GOD_ADDRESS must be set (the hx… address that holds the genesis supply)}"
GENESIS_BALANCE="${GENESIS_BALANCE:?GENESIS_BALANCE must be set (hex loop)}"
GOD_KEYSTORE_JSON="${GOD_KEYSTORE_JSON:?GOD_KEYSTORE_JSON must be set (the god wallet keystore JSON, used to sign the governance deploy)}"

# The base image entry point sources /goloop/venv/bin/activate before it
# starts goloop, putting pyexec on PATH. This entry point replaces that entry
# point, so it must put pyexec on PATH itself: the governance SCORE is a
# Python contract, and goloop can only run it with pyexec reachable.
export PATH="/goloop/venv/bin:$PATH"

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
#
# The genesis chain.fee.stepPrice field has no lasting effect: the governance
# SCORE's on_install overrides it once deployed below.
jq \
  --arg bal "$GENESIS_BALANCE" '
    .nid = "0x1"
  | del(.chain.nid)
  | (.accounts[] | select(.name == "god") | .balance) = $bal
' genesis.json > genesis.patched.json

mv genesis.patched.json genesis.json

echo "--- genesis summary ---"
jq '{nid: .nid, stepPrice: .chain.fee.stepPrice, accounts: .accounts}' genesis.json
echo "-----------------------"

goloop gs gen -i . -o gs.zip

goloop server start &
SERVER_PID=$!

# goloop creates cli.sock before it accepts connections on it, so testing for
# the socket file is not a readiness check: `chain join` then fails with
# "connection refused". Probe the socket with a real call instead.
for _ in $(seq 1 60); do
  goloop system info >/dev/null 2>&1 && break
  sleep 0.5
done
goloop system info >/dev/null 2>&1 || {
  echo "goloop server did not answer on $GOLOOP_NODE_SOCK" >&2
  exit 1
}

goloop chain join --genesis gs.zip --channel icon --platform icon --auto_start

# --auto_start above only persists the chain's autoStart config for its next
# restart; the chain stays in the "stopped" state right after join.
goloop chain start icon

# debug_estimateStep only answers once rpcIncludeDebug is true. No server
# flag or environment variable sets this field; it takes effect at once, with
# no restart.
goloop system config rpcIncludeDebug true

RPC="http://127.0.0.1:9080/api/v3"

# A deploy into a chain still at height 0 wedges the node, so wait for the
# first block before submitting the governance deploy.
for _ in $(seq 1 60); do
  height=$(
    curl -sf -X POST "$RPC" -H 'Content-Type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"icx_getLastBlock"}' \
      | jq -r '.result.height // "0x0"'
  )
  [ "$((height))" -ge 1 ] && break
  sleep 0.5
done

echo "$GOD_KEYSTORE_JSON" > "$WORK/god.json"

# The governance SCORE's on_install writes the step price and the step-cost
# table; a fresh genesis carries neither. cx…01 answers ContractNotFound until
# this deploy lands. The step limit covers the deploy's measured ~1.08e9 step
# use and matches the genesis chain.fee.stepLimit.invoke cap.
goloop rpc sendtx deploy /goloop/icon_governance.zip \
  --to cx0000000000000000000000000000000000000001 \
  --content_type application/zip \
  --key_store "$WORK/god.json" --key_password "$KEYSTORE_PASSWORD" \
  --nid 0x1 --step_limit 0x9502f900 --uri "$RPC"

wait "$SERVER_PID"
