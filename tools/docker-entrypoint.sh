#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
#
# The pinned open.mp release is a 32-bit executable. Its glibc readdir() cannot
# represent the 64-bit directory offsets that overlayfs and ext4 report, so
# scanning its own components directory aborts with EOVERFLOW ("Value too large
# for defined data type"). tmpfs keeps those offsets inside a 32-bit long, so
# the fixture directory has to be a tmpfs mount; this script fills that empty
# mount from the copy baked into the image.
#
# The mount is deliberate, not incidental: without it the unchanged server
# cannot start in a container, and the server is not ours to patch.
#
# docker-compose.yml declares the mount. Hosts that cannot declare one let the
# container mount it here instead, which needs CAP_SYS_ADMIN.
set -e

SERVER=/work/.runtime/Server
PRISTINE=/opt/poc/Server
SIZE=${POC_SERVER_TMPFS_SIZE:-320m}

filesystem() { stat -f -c %T "$1" 2>/dev/null || echo unknown; }

mkdir -p "$SERVER"

if [ "$(filesystem "$SERVER")" != "tmpfs" ]; then
    if mount -t tmpfs -o "size=$SIZE,exec" tmpfs "$SERVER" 2>/dev/null; then
        echo "poc-entrypoint: mounted a ${SIZE} tmpfs on ${SERVER}." >&2
    else
        echo "poc-entrypoint: warning: ${SERVER} is $(filesystem "$SERVER"), not tmpfs." >&2
        echo "poc-entrypoint: the fixture will abort with 'Value too large for defined data type'." >&2
        echo "poc-entrypoint: declare a tmpfs mount there, or allow CAP_SYS_ADMIN so this script can." >&2
    fi
fi

if [ -x "$PRISTINE/omp-server" ] && [ ! -x "$SERVER/omp-server" ]; then
    cp -a "$PRISTINE/." "$SERVER/"
fi

exec "$@"
