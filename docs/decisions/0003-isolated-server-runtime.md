# ADR 0003: unchanged release under an isolated QEMU runtime

Accepted during implementation, 2026-09-07.

The cloud kernel can start the official open.mp i386 release, but its native socket calls return `EACCES`. The isolated Debian loader and libraries alone therefore cannot run the multiplayer fixture. A pristine x86_64 source build was investigated and configured, but was not completed.

Run the **unchanged official v1.5.8.3079 release** with a checksum-pinned Debian `qemu-i386-static`, translating its system calls through the host x86_64 ABI. This successfully opens the loopback UDP endpoint. Keep the emulator and Debian bookworm i386 libraries in `.runtime`, preserving package notices and leaving host system libraries untouched.

The release executable and all 22 component files were compared byte-for-byte with the verified archive. Only configuration and the deliberately small Pawn gamemode are supplied by this repository. No changes to upstream networking, player admission, or server components are permitted by this decision.

The source fallback remains a possible future portability experiment. Its success is not claimed. Current reproducibility targets the supplied Amazon Linux x86_64 cloud workspace with Node 24, passwordless package installation, and outbound access to the pinned downloads.

See the [manifest](../../test-server/manifest.json), [runtime recipe](../../tools/setup-runtime.py), and [runtime instructions](../../test-server/README.md). The acceptance suite uses this exact unchanged release path.
