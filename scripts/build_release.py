#!/usr/bin/env python3
"""Build the release images of the InkSights firmware for every board.

ESP32 boards: one factory image per board (bootloader, partition table, boot_app0 and the
application merged at their offsets), flashed at address 0x0, e.g. with ESPWebTool.
XIAO SAMD21: a UF2 file for its USB drive (press RESET twice quickly, copy the file onto it).

Output: dist/v<version>/inksights-v<version>-<env>-factory.bin, inksights-v<version>-xiao-samd21.uf2
and SHA256SUMS.txt. The version is FW_VERSION in firmware/InkSights/InkSights.ino.

With --ota-dir <folder> the application image of every ESP32 board is also copied there as <env>.bin
with a manifest.json ({env: {version, size, sha256}}): the firmware the settings page carries for
updates over WiFi (the Docker image takes server/web/fw).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys


PROJECT_DIR = Path(__file__).resolve().parents[1]
SKETCH = PROJECT_DIR / "firmware" / "InkSights" / "InkSights.ino"
ESP32_ENVIRONMENTS = (
    "seeed-xiao-esp32-c3",
    "seeed-xiao-esp32-s3",
    "esp32-s3-supermini",
    "esp32-s3-zero",
    "esp32-c3-supermini",
    "esp32-c3-zero",
    "adafruit-qtpy-esp32-s3-n4r2",
    "adafruit-qtpy-esp32-s3-nopsram",
)
# UF2 boards: environment -> (flash address of the application, UF2 family ID)
UF2_ENVIRONMENTS = {
    "xiao-samd21": (0x2000, 0x68ED2B88),   # 8 KiB bootloader in front (upload.offset_address); SAMD21 family
}
ALL_ENVIRONMENTS = tuple(UF2_ENVIRONMENTS) + ESP32_ENVIRONMENTS


def firmware_version() -> str:
    match = re.search(r'FW_VERSION\[\]\s*=\s*"([^"]+)"', SKETCH.read_text(encoding="utf-8"))
    if not match:
        raise RuntimeError(f"FW_VERSION was not found in {SKETCH}")
    return match.group(1)


def platformio_command(explicit: str | None) -> str:
    command = explicit or os.environ.get("PLATFORMIO_CMD")
    if command:
        return command
    for candidate in ("pio", "platformio"):
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    penv = Path.home() / ".platformio" / "penv" / ("Scripts/pio.exe" if os.name == "nt" else "bin/pio")
    if penv.is_file():
        return str(penv)
    raise RuntimeError("PlatformIO was not found; install it or pass --pio <path>")


def run_build(pio: str, environment: str) -> None:
    print(f"\n=== Building {environment} ===", flush=True)
    subprocess.run([pio, "run", "--project-dir", str(PROJECT_DIR), "-e", environment], check=True)


def flash_segments(build_dir: Path) -> list[tuple[int, Path]]:
    manifest_path = build_dir / "flash_manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError(f"Missing flash layout after the build: {manifest_path}")
    images = json.loads(manifest_path.read_text(encoding="utf-8")).get("segments")
    if not isinstance(images, list) or not images:
        raise RuntimeError(f"Incomplete flash layout in {manifest_path}")
    segments: list[tuple[int, Path]] = []
    for image in images:
        try:
            segments.append((int(str(image["offset"]), 0), Path(image["path"])))
        except (KeyError, TypeError, ValueError) as error:
            raise RuntimeError(f"Invalid flash image entry in {manifest_path}: {image}") from error
    return sorted(segments, key=lambda item: item[0])


def merge_factory_image(segments: list[tuple[int, Path]], destination: Path) -> None:
    previous_end = 0
    prepared: list[tuple[int, bytes]] = []
    for offset, path in segments:
        if not path.is_file():
            raise RuntimeError(f"Missing flash segment: {path}")
        data = path.read_bytes()
        if not data:
            raise RuntimeError(f"Flash segment is empty: {path}")
        if offset < previous_end:
            raise RuntimeError(f"Flash segment overlaps a previous segment: {path}")
        prepared.append((offset, data))
        previous_end = offset + len(data)
    image = bytearray(b"\xff" * previous_end)
    for offset, data in prepared:
        image[offset:offset + len(data)] = data
    destination.write_bytes(image)


def write_uf2(firmware: Path, destination: Path, address: int, family: int) -> None:
    """UF2 as specified at github.com/microsoft/uf2: 512-byte blocks with 256 bytes of payload each."""
    data = firmware.read_bytes()
    if not data:
        raise RuntimeError(f"Application image is empty: {firmware}")
    payload = 256
    count = (len(data) + payload - 1) // payload
    blocks = bytearray()
    for n in range(count):
        chunk = data[n * payload:(n + 1) * payload].ljust(payload, b"\x00")
        header = struct.pack("<8I", 0x0A324655, 0x9E5D5157, 0x00002000,   # magic, magic, flag: family ID present
                             address + n * payload, payload, n, count, family)
        blocks += header + chunk.ljust(476, b"\x00") + struct.pack("<I", 0x0AB16F30)
    destination.write_bytes(blocks)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_release_tag(version: str) -> None:
    tag = os.environ.get("GITHUB_REF_NAME", "")
    if os.environ.get("GITHUB_REF_TYPE", "") == "tag" and tag != f"v{version}":
        raise RuntimeError(f"Git tag {tag!r} does not match FW_VERSION {version!r}; expected v{version}")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pio", help="path to the PlatformIO pio executable")
    parser.add_argument("--output-dir", type=Path, default=PROJECT_DIR / "dist",
                        help="base output folder; a v<version> folder is created in it")
    parser.add_argument("--environment", action="append", choices=ALL_ENVIRONMENTS, dest="environments",
                        help="build only this board environment; may be given more than once")
    parser.add_argument("--skip-build", action="store_true", help="package the existing .pio build output")
    parser.add_argument("--ota-dir", type=Path,
                        help="also copy the ESP32 application images and a manifest.json there (updates over WiFi)")
    return parser.parse_args()


def main() -> int:
    args = parse_arguments()
    version = firmware_version()
    validate_release_tag(version)
    pio = None if args.skip_build else platformio_command(args.pio)
    environments = tuple(args.environments or ALL_ENVIRONMENTS)
    release_dir = args.output_dir.resolve() / f"v{version}"
    release_dir.mkdir(parents=True, exist_ok=True)
    created: list[Path] = []
    ota: dict[str, dict] = {}
    if args.ota_dir:
        args.ota_dir.mkdir(parents=True, exist_ok=True)

    for environment in environments:
        if pio:
            run_build(pio, environment)
        build_dir = PROJECT_DIR / ".pio" / "build" / environment
        firmware = build_dir / "firmware.bin"
        if not firmware.is_file():
            raise RuntimeError(f"Missing application image after the build: {firmware}")
        base_name = f"inksights-v{version}-{environment}"
        if environment in UF2_ENVIRONMENTS:
            image = release_dir / f"{base_name}.uf2"
            write_uf2(firmware, image, *UF2_ENVIRONMENTS[environment])
        else:
            image = release_dir / f"{base_name}-factory.bin"
            merge_factory_image(flash_segments(build_dir), image)
            if args.ota_dir:   # the application alone: what an update over WiFi writes into the firmware slot
                app = args.ota_dir / f"{environment}.bin"
                shutil.copyfile(firmware, app)
                ota[environment] = {"version": version, "size": app.stat().st_size, "sha256": sha256(app)}
        created.append(image)
        print(f"Created {image.name}", flush=True)

    checksum_file = release_dir / "SHA256SUMS.txt"
    checksum_file.write_text("".join(f"{sha256(path)}  {path.name}\n" for path in sorted(created)),
                             encoding="utf-8", newline="\n")
    if args.ota_dir:
        (args.ota_dir / "manifest.json").write_text(json.dumps(ota, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"Firmware for updates over WiFi: {args.ota_dir} ({len(ota)} boards)")
    print(f"\nRelease files: {release_dir}")
    print(f"Created {len(created)} images and {checksum_file.name}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
