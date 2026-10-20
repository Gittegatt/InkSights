"""Export PlatformIO's resolved flash layout after each ESP32 firmware build.

Writes flash_manifest.json next to firmware.bin: every image (bootloader, partition table,
boot_app0, the application, extra images of the board) with its flash offset.
scripts/build_release.py merges them into one factory image for address 0x0.
"""

Import("env")

import json
from pathlib import Path


def export_flash_manifest(source, target, env):
    build_dir = Path(env.subst("$BUILD_DIR")).resolve()
    segments = []
    for offset, image_path in env.get("FLASH_EXTRA_IMAGES", []):
        segments.append({
            "offset": str(offset),
            "path": str(Path(env.subst(str(image_path))).resolve()),
        })
    segments.append({
        "offset": env.subst("$ESP32_APP_OFFSET"),
        "path": str((build_dir / f"{env.subst('$PROGNAME')}.bin").resolve()),
    })
    manifest = {"environment": env.subst("$PIOENV"), "segments": segments}
    (build_dir / "flash_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", export_flash_manifest)
