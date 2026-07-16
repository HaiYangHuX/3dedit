#!/bin/sh
set -eu

# 初始化任务可重复执行，重启开发环境时不会删除已有资源。
mc alias set local http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mb --ignore-existing "local/$MINIO_BUCKET"
# 浏览器直传与缩略图读取需要 bucket 级 CORS，特别是暴露 Multipart ETag。
mc cors set "local/$MINIO_BUCKET" /init/minio-cors.xml
