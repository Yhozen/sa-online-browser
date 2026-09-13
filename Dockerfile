# SPDX-License-Identifier: GPL-3.0-or-later
# The pinned platform below is deliberate, not a portability slip.
# check=skip=FromPlatformFlagConstDisallowed
#
# Two images from one build graph:
#   --target server  fixture, gateway and built browser baked in (run the game)
#   --target dev      the same, plus Xvfb and Chromium, with the source
#                     directories mounted from the checkout (development)
#
# Both are linux/amd64. tools/setup.mjs targets Linux x86_64 because the pinned
# open.mp release is an i386 executable and the QEMU that runs it is an x86_64
# binary. On an Apple Silicon Mac, Docker Desktop emulates this platform, and
# the i386 server then runs emulated inside it.
#
# Debian trixie, not bookworm: tools/setup-runtime.py extracts the pinned
# archives with tarfile's filter argument, which needs Python 3.11.4 or newer.

FROM --platform=linux/amd64 node:24.14.0-trixie AS base
# The Debian equivalents of the dnf list in tools/setup.mjs. Keeping them here
# is the point of these images: no compiler, CMake or Python on the host.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        clang \
        cmake \
        ninja-build \
        git \
        python3 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /work
# tools/setup.mjs would otherwise try to install those packages with sudo dnf.
ENV POC_SKIP_SYSTEM_DEPS=1
# The gateway defaults to loopback, which a published container port cannot
# reach. Compose still publishes only to the host's loopback address.
ENV POC_HOST=0.0.0.0

FROM base AS build
# setup.mjs finishes with the Vite build, so it needs the whole checkout.
COPY . .
# The cache mount keeps the pinned downloads (open.mp release, Debian i386
# libraries, QEMU) across rebuilds. Their SHA256 is still verified every run,
# and only the extracted trees become image content.
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/work/.runtime/downloads \
    POC_SKIP_PLAYWRIGHT=1 node tools/setup.mjs
# Both images mount tmpfs over .runtime/Server, which hides whatever the image
# holds there, so the provisioned tree is kept aside for the entrypoint to
# restore. See tools/docker-entrypoint.sh for why the mount is required.
RUN mkdir -p /opt/poc && mv /work/.runtime/Server /opt/poc/Server
# Copied out of /work because the development service mounts tools/ from the
# checkout, where a lost execute bit would stop the container from starting.
RUN cp /work/tools/docker-entrypoint.sh /usr/local/bin/poc-entrypoint \
    && chmod +x /usr/local/bin/poc-entrypoint

FROM build AS server
EXPOSE 3000
# tools/dev.mjs supervises the stock server and the gateway as one lifetime and
# forwards shutdown to both.
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/poc-entrypoint"]
CMD ["node", "tools/dev.mjs"]

FROM build AS dev
# Xvfb and Chromium serve npm run verify:poc inside the container. Ordinary
# verification uses the host browser instead, which has a real GPU.
RUN apt-get update && apt-get install -y --no-install-recommends \
        xvfb \
        xauth \
    && rm -rf /var/lib/apt/lists/*
# Outside node_modules, so reinstalling dependencies cannot discard the browser.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN npx --yes playwright@1.59.1 install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/poc-entrypoint"]
CMD ["bash"]
