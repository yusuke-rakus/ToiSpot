#!/bin/sh
set -eu

# 初回は保存データがないため、importを指定しない。
set -- firebase emulators:start \
  --project demo-toilet-map \
  --only auth,firestore \
  --config /workspace/firebase.json \
  --export-on-exit=/data/export

if [ -f /data/export/firebase-export-metadata.json ]; then
  set -- "$@" --import=/data/export
fi

# 停止シグナルをCLIへ渡し、データのexportを完了させる。
exec "$@"
