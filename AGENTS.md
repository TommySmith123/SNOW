# AGENTS.md

Use the baseline guidance from `G:/chatgpt/通用文件/AGENTS.md` unless this repository defines stronger local rules.

Project-specific instructions can be added below. Keep them focused on this repo's architecture, commands, deployment boundaries, and known local constraints.

## Project boundaries

- `web/` is the only Sites-hosted project. Keep `.openai/hosting.json`, PWA assets, and the public web build there.
- `mobile/` is the only Capacitor/native project. Keep Android, iOS, signing, and native bridge files out of `web/`.
- `web/app/game/` is the canonical gameplay source shared by both delivery surfaces. Do not copy or fork gameplay logic under `mobile/`.
- A clean `web/` build must never require installing `mobile/` dependencies.
- `mobile/www/` is generated output and must not be committed or packaged with Sites.
