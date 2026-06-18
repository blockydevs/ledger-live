#!/bin/bash
set -euo pipefail

# Two-validator devnet. The scenario's redelegate step needs a second
# validator to redelegate to; with `--v 2` Tendermint splits voting power
# 50/50, so both nodes have to be online for consensus to make progress
# (each holds ~50% — neither alone hits 2/3). Each node starts from this
# entrypoint with its index as the only argument.
NODE_INDEX="${1:-0}"
CHAIN_ID="bbn-devnet"
TESTNET_DIR="/testnet"
HOME_DIR="$TESTNET_DIR/node${NODE_INDEX}/babylond"
KEYRING="test"
DENOM="ubbn"
INIT_LOCK="$TESTNET_DIR/.init.done"

# Deterministic dev mnemonic — the tester's software signer derives its
# account from the same one. Well-known BIP-39 test vector. Mirrored
# verbatim in src/helpers.ts — when changing one, change both.
DEV_MNEMONIC="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"

# Clear any inherited BLS password so it can't shadow the password file handed
# to `start` below. `babylond testnet` writes an EIP-2335-encrypted bls_key.json
# plus a sibling bls_password.txt holding the password it used (see the
# `--bls-password-file` note further down); if a stray BABYLON_BLS_PASSWORD is
# set, `start` decrypts with it instead and panics with "invalid checksum".
unset BABYLON_BLS_PASSWORD

# Only node 0 runs chain init. node 1 waits for the shared volume to be
# populated. INIT_LOCK is the handshake.
if [ "$NODE_INDEX" = "0" ] && [ ! -f "$INIT_LOCK" ]; then
  # `babylond testnet --v 2` bootstraps a 2-validator chain in one call:
  # generates validator keys (cosmos + BLS) for both nodes, funds them, creates
  # gentxs, collects them, and writes complete per-node genesis files with all
  # Babylon-specific module schemas (mint, btccheckpoint, btclightclient,
  # finality, btcstaking) populated correctly. Using this avoids re-implementing
  # Babylon's e2e/initialization Go logic in shell.
  babylond testnet \
    --v 2 \
    --chain-id "$CHAIN_ID" \
    --output-dir "$TESTNET_DIR" \
    --keyring-backend "$KEYRING" \
    --time-between-blocks-seconds 1 \
    --btc-network regtest

  # Add a deterministic dev account on top of what testnet created. This is
  # the account the software signer will use. add-genesis-account mutates only
  # auth + bank balances — safe to call after testnet has finalized gentxs.
  printf "%s\n\n" "$DEV_MNEMONIC" \
    | babylond keys add dev --recover --keyring-backend "$KEYRING" --home "$HOME_DIR"
  babylond add-genesis-account dev "1000000000000${DENOM}" \
    --keyring-backend "$KEYRING" --home "$HOME_DIR"

  # The ONLY app_state mutation we need: short epoch so wait-for-epoch in the
  # scenario completes in seconds, not minutes. Everything else stays at the
  # values Babylon itself writes — no risk of schema drift.
  GENESIS="$HOME_DIR/config/genesis.json"
  TMP="$GENESIS.tmp"
  jq '.app_state.epoching.params.epoch_interval = "10"' "$GENESIS" > "$TMP" && mv "$TMP" "$GENESIS"

  # Propagate node 0's mutated genesis (dev account + short epoch) to node 1.
  # `babylond testnet` writes each node's own genesis; without this copy node 1
  # would refuse to peer (different AppHash → consensus failure).
  cp "$GENESIS" "$TESTNET_DIR/node1/babylond/config/genesis.json"

  # Mesh node 0 ↔ node 1 over P2P so Tendermint reaches the 2/3 quorum.
  NODE0_ID=$(babylond tendermint show-node-id --home "$TESTNET_DIR/node0/babylond")
  NODE1_ID=$(babylond tendermint show-node-id --home "$TESTNET_DIR/node1/babylond")

  for i in 0 1; do
    APP_TOML="$TESTNET_DIR/node${i}/babylond/config/app.toml"
    CONFIG_TOML="$TESTNET_DIR/node${i}/babylond/config/config.toml"

    # Expose LCD + Tendermint RPC on all interfaces (default binds to localhost
    # inside the container, which the host port-forward can't reach).
    sed -i 's|^enable = false|enable = true|' "$APP_TOML"
    sed -i 's|address = "tcp://localhost:1317"|address = "tcp://0.0.0.0:1317"|' "$APP_TOML"
    sed -i 's|^enabled-unsafe-cors = false|enabled-unsafe-cors = true|' "$APP_TOML"
    sed -i 's|laddr = "tcp://127.0.0.1:26657"|laddr = "tcp://0.0.0.0:26657"|' "$CONFIG_TOML"
  done

  # Hostnames are the docker-compose service names (babylond, babylond-node1).
  sed -i "s|^persistent_peers = .*|persistent_peers = \"${NODE1_ID}@babylond-node1:26656\"|" \
    "$TESTNET_DIR/node0/babylond/config/config.toml"
  sed -i "s|^persistent_peers = .*|persistent_peers = \"${NODE0_ID}@babylond:26656\"|" \
    "$TESTNET_DIR/node1/babylond/config/config.toml"

  touch "$INIT_LOCK"
elif [ "$NODE_INDEX" = "1" ]; then
  echo "node1: waiting for node0 to finalize chain init..."
  # Fail fast if node 0 never finishes init; otherwise this container would
  # hang indefinitely and hide the real error in node 0's logs.
  WAIT_DEADLINE=$((SECONDS + 120))
  until [ -f "$INIT_LOCK" ]; do
    if [ "$SECONDS" -gt "$WAIT_DEADLINE" ]; then
      echo "node1: timed out after 120s waiting for node 0 to finish init" >&2
      exit 1
    fi
    sleep 1
  done
fi

# `babylond testnet` writes bls_key.json AND a sibling bls_password.txt with
# the password it used to encrypt the key (EIP-2335 format). Point start at
# that file so encryption (testnet write) and decryption (start load) use the
# same password — no "invalid checksum" mismatch.
exec babylond start \
  --home "$HOME_DIR" \
  --bls-password-file "$HOME_DIR/config/bls_password.txt"
