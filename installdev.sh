#!/usr/bin/env bash

sudo apt update
sudo apt install -y curl build-essential
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v

