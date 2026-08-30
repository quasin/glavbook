#!/usr/bin/env bash
set -e

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

sudo apt update
sudo apt install -y curl build-essential
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

node -v
npm -v

sudo npm install -g corepack npm@latest
corepack enable

yarn --version
#yarn init -y
yarn config set --home enableTelemetry 0
yarn install
