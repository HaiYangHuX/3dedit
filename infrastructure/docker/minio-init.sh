#!/bin/sh
set -eu

# 初始化任务可重复执行，重启开发环境时不会删除已有资源。
mc alias set local http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mb --ignore-existing "local/$MINIO_BUCKET"
