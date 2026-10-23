"""Bounded, driver-free Brother label printing over a configured TCP endpoint.

QL-820NWB uses Brother's documented monochrome raster protocol. VC-500W uses
its native XML/JPEG protocol, as documented by the node-vc-500w project. These
are separate transports, not interchangeable PDF or AirPrint commands.

Addresses come only from administrator-managed integration options. The panel
submits one validated image per request; it cannot submit raw printer commands.
No labels or addresses are written to audit storage. A per-host mutex and an
in-memory request ledger prevent concurrent or repeated submissions. Jobs are
never retried automatically, including after an ambiguous transport failure.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import ipaddress
import math
import re
import struct
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass

MAX_IMAGE_BYTES = 2_000_000
JOB_TIMEOUT = 120
REPLY_TIMEOUT = 10
MAX_JOBS = 1000

# media width, fixed feed length (0 = continuous), printable dots, right pins.
# Die-cut lengths are printable raster heights, excluding the physical margins.
QL_ROLLS = {
    "dk_22205": (62, 0, 696, 12, 0),
    "dk_22210": (29, 0, 306, 6, 0),
    "dk_11209": (62, 29, 696, 12, 271),
    "dk_11201": (29, 90, 306, 6, 991),
    "dk_11202": (62, 100, 696, 12, 1109),
}
VC_ROLLS = {"cz_1001": 9, "cz_1002": 12, "cz_1003": 19, "cz_1004": 25, "cz_1005": 50}


class PrintError(Exception):
    """A short, non-sensitive error safe to display and log."""


def printer_host(value: str) -> str:
    """Accept an IP address or DNS hostname, without a URL, port or credentials."""
    value = value.strip()
    if not value:
        return ""
    try:
        address = ipaddress.ip_address(value)
        if address.is_multicast or address.is_unspecified:
            raise PrintError("Use a unicast printer address.")
        return str(address)
    except ValueError:
        if len(value) > 253 or not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", value):
            raise PrintError("Enter a printer IP address or hostname, without a URL or port.") from None
        return value.lower()


@dataclass(frozen=True)
class Label:
    """Validated physical media, pixel dimensions and native print payload."""

    model: str
    roll: str
    width_mm: int
    length_mm: int
    width: int
    height: int
    data: bytes


def _jpeg_size(data: bytes) -> tuple[int, int]:
    """Read JPEG frame dimensions without decoding pixels or allocating images."""
    if not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
        raise PrintError("Invalid JPEG label image.")
    index = 2
    while index + 4 <= len(data):
        if data[index] != 0xFF:
            break
        while index < len(data) and data[index] == 0xFF:
            index += 1
        if index >= len(data):
            break
        marker = data[index]
        index += 1
        if marker in (0xDA, 0xD9):
            break
        if index + 2 > len(data):
            break
        length = int.from_bytes(data[index:index + 2], "big")
        if length < 2 or index + length > len(data):
            break
        if marker in (0xC0, 0xC1, 0xC2) and length >= 8:
            height, width = struct.unpack(">HH", data[index + 3:index + 7])
            return width, height
        index += length
    raise PrintError("The JPEG label has no supported image frame.")


def prepare_label(model: str, roll: str, length: int, encoded: str) -> Label:
    """Validate and encode a single label in an executor, before any network I/O.

    QL input is row-major 1-bit monochrome (MSB first, black=1) over the actual
    printable area. VC input is JPEG at 313 cross-web / 317 vivid feed dpi.
    Lengths are millimetres and must match the selected roll. No client-supplied
    native command, hostname or arbitrary raster geometry is accepted.
    """
    if len(encoded) > 2_700_000 or not isinstance(length, int) or isinstance(length, bool):
        raise PrintError("Invalid label size.")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise PrintError("Invalid label image encoding.") from None
    if not data or len(data) > MAX_IMAGE_BYTES or not 29 <= length <= 300:
        raise PrintError("The label image or length is outside the supported limits.")
    if model == "ql820nwb" and roll in QL_ROLLS:
        media_width, fixed_length, width, right, fixed_height = QL_ROLLS[roll]
        if (fixed_length and length != fixed_length) or (not fixed_length and length < 30):
            raise PrintError("Label length does not match the selected DK roll.")
        height = fixed_height or math.floor(length / 25.4 * 300 + 0.5) - 70
        stride = (width + 7) // 8
        if len(data) != stride * height:
            raise PrintError("The monochrome image does not match the DK printable area.")
        # Physical head pins run from right to left; every uncompressed raster
        # row spans all 720 pins. Padding and paper margins remain white.
        raster = bytearray()
        for row in range(height):
            line = bytearray(90)
            for x in range(width):
                if data[row * stride + x // 8] & (0x80 >> (x % 8)):
                    pin = right + width - 1 - x
                    line[pin // 8] |= 0x80 >> (pin % 8)
            raster.extend(b"g\x00\x5a" + line)
        # Native media checking is enabled; use normal 300 dpi, monochrome,
        # no compression, auto-cut, and a final print-and-feed command.
        info = bytes((0xCE, 0x0B if fixed_length else 0x0A, media_width, fixed_length))
        commands = (
            b"\x1b\x40\x1b\x69\x61\x01\x1b\x69\x21\x00"
            + b"\x1b\x69\x7a" + info + struct.pack("<I", height) + b"\x00\x00"
            + b"\x1b\x69\x4d\x40\x1b\x69\x41\x01\x1b\x69\x4b\x08"
            + b"\x1b\x69\x64" + struct.pack("<H", 0 if fixed_length else 35)
            + b"M\x00" + raster + b"\x1a"
        )
        return Label(model, roll, media_width, length, width, height, commands)
    if model == "vc500w" and roll in VC_ROLLS and length >= 30:
        media_width = VC_ROLLS[roll]
        width = math.floor(media_width / 25.4 * 313 + 0.5)
        height = math.floor(length / 25.4 * 317 + 0.5)
        if _jpeg_size(data) != (width, height):
            raise PrintError("The JPEG image does not match the CZ roll dimensions.")
        return Label(model, roll, media_width, length, width, height, data)
    raise PrintError("The roll is not supported by the selected printer.")


async def _ql_status(reader: asyncio.StreamReader) -> bytes:
    """Read exactly one bounded Brother status frame; never infer missing data."""
    frame = await asyncio.wait_for(reader.readexactly(32), REPLY_TIMEOUT)
    if frame[:5] != b"\x80\x20\x42\x34\x41":
        raise PrintError("The endpoint did not identify itself as a QL-820NWB.")
    if frame[8] or frame[9]:
        raise PrintError("The QL printer reports a media, cover, cutter or busy error.")
    return frame


def _xml(data: bytes) -> ET.Element:
    """Parse a size-bounded reply, rejecting DTDs and entity declarations."""
    if len(data) > 65536 or b"<!" in data:
        raise PrintError("Invalid printer response.")
    try:
        return ET.fromstring(data.strip())
    except ET.ParseError:
        raise PrintError("Malformed printer response.") from None


async def _vc_reply(reader: asyncio.StreamReader) -> tuple[ET.Element, ET.Element | None]:
    """Read the XML status and optional length-framed payload from VC-500W.

    The wire separator is '</status>\n', followed by one space before the
    payload. A reply timeout, EOF or malformed size aborts without retransmit.
    """
    raw = await asyncio.wait_for(reader.readuntil(b"</status>\n"), REPLY_TIMEOUT)
    status = _xml(raw)
    if status.tag != "status" or status.findtext("code") != "0":
        raise PrintError("The VC printer rejected the request or is busy.")
    try:
        size = int(status.findtext("datasize", "0"))
    except ValueError:
        raise PrintError("Invalid printer response size.") from None
    if not 0 <= size <= 65536:
        raise PrintError("Invalid printer response size.")
    payload = None
    if size:
        first = await asyncio.wait_for(reader.readexactly(1), REPLY_TIMEOUT)
        if first in (b" ", b"\n", b"\r"):
            data = await asyncio.wait_for(reader.readexactly(size), REPLY_TIMEOUT)
        else:
            data = first + await asyncio.wait_for(reader.readexactly(size - 1), REPLY_TIMEOUT)
        payload = _xml(data)
    return status, payload


async def _vc_command(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, body: str) -> tuple[ET.Element, ET.Element | None]:
    writer.write(('<?xml version="1.0" encoding="UTF-8"?>\n' + body).encode())
    await writer.drain()
    return await _vc_reply(reader)


class PrintService:
    """Serialize explicit print actions and retain bounded idempotency results.

    Request IDs are retained for one hour in memory, not across HA restarts.
    A timed-out submitted job remains 'unknown', never a successful print and
    never an invitation to retry automatically. Only the user starts a new run.
    """

    def __init__(self, hosts: dict[str, str]) -> None:
        self.hosts = {model: printer_host(host) for model, host in hosts.items()}
        self._locks: dict[str, asyncio.Lock] = {}
        self._jobs: dict[str, dict] = {}

    def configured(self) -> dict[str, bool]:
        """Expose readiness without exposing network addresses to diagnostics."""
        return {model: bool(host) for model, host in self.hosts.items()}

    async def submit(self, request_id: str, label: Label) -> dict:
        host = self.hosts.get(label.model, "")
        if not host:
            raise PrintError("Configure this printer's network address in Entity Audit settings first.")
        fingerprint = hashlib.sha256(label.model.encode() + label.roll.encode() + label.data).hexdigest()
        now = time.monotonic()
        self._jobs = {key: job for key, job in self._jobs.items() if job["state"] == "in_progress" or now - job["created"] < 3600}
        if request_id in self._jobs:
            previous = self._jobs[request_id]
            if previous["fingerprint"] != fingerprint:
                raise PrintError("This print request ID was already used for a different label.")
            return self._result(previous)
        if len(self._jobs) >= MAX_JOBS:
            raise PrintError("The local print request ledger is full. Try again later.")
        lock = self._locks.setdefault(host, asyncio.Lock())
        if lock.locked():
            raise PrintError("This printer is already processing another Entity Audit label.")
        job = {"created": now, "fingerprint": fingerprint, "state": "in_progress", "submitted": False,
               "message": "The printer is processing this request."}
        self._jobs[request_id] = job
        writer = None
        async with lock:
            try:
                async with asyncio.timeout(JOB_TIMEOUT):
                    reader, writer = await asyncio.wait_for(asyncio.open_connection(host, 9100, limit=65536), 5)
                    if label.model == "ql820nwb":
                        writer.write(b"\x1b\x69\x53")
                        await writer.drain()
                        status = await _ql_status(reader)
                        fixed = QL_ROLLS[label.roll][1]
                        if status[18] != 0 or status[19] != 0:
                            raise PrintError("The QL printer is not idle.")
                        if status[10] != label.width_mm or status[11] != (0x4B if fixed else 0x4A) or status[17] != fixed:
                            raise PrintError("The loaded DK roll does not match the selected roll.")
                        job["submitted"] = True
                        writer.write(label.data)
                        await writer.drain()
                        while True:
                            status = await _ql_status(reader)
                            if status[18] == 1:
                                job.update(state="completed", message="The QL printer reported label completion.")
                                break
                    else:
                        _, config = await _vc_command(reader, writer, "<read><path>/config.xml</path></read>")
                        if config is None or config.tag != "config" or "VC500W" not in re.sub(r"[^A-Z0-9]", "", config.findtext("model_name", "").upper()):
                            raise PrintError("The endpoint did not identify itself as a VC-500W.")
                        try:
                            loaded_width = float(config.findtext("media_features/width_inches", "nan")) * 25.4
                        except ValueError:
                            loaded_width = math.nan
                        if not math.isfinite(loaded_width) or abs(loaded_width - label.width_mm) > 0.6:
                            raise PrintError("The loaded CZ roll does not match the selected roll.")
                        _, status = await _vc_command(reader, writer, "<read><path>/status.xml</path></read>")
                        if status is None or status.findtext("print_state") != "IDLE" or status.findtext("print_job_error", "NONE") not in ("", "NONE", "0"):
                            raise PrintError("The VC printer is not idle or reports an error.")
                        await _vc_command(reader, writer,
                            f"<print><mode>vivid</mode><speed>0</speed><lpi>317</lpi>"
                            f"<width>0</width><height>0</height><dataformat>jpeg</dataformat>"
                            f"<autofit>1</autofit><datasize>{len(label.data)}</datasize><cutmode>full</cutmode></print>")
                        job["submitted"] = True
                        writer.write(label.data)
                        await writer.drain()
                        await _vc_reply(reader)
                        # Data acceptance is not evidence of physical completion.
                        # Closing the connection also allows firmware to cut.
                        job.update(state="accepted", message="The VC printer accepted the label data. Check the printed label.")
            except asyncio.CancelledError:
                job.update(state="unknown" if job["submitted"] else "failed", message="Printing was interrupted. Check the printer before starting another run.")
                raise
            except (PrintError, OSError, TimeoutError, asyncio.IncompleteReadError, asyncio.LimitOverrunError) as error:
                state = "unknown" if job["submitted"] else "failed"
                message = str(error) if isinstance(error, PrintError) else "Printer connection failed or timed out. Check the printer before starting another run."
                job.update(state=state, message=message)
            finally:
                if writer is not None:
                    writer.close()
                    try:
                        await asyncio.wait_for(writer.wait_closed(), 2)
                    except (OSError, TimeoutError):
                        pass
        return self._result(job)

    @staticmethod
    def _result(job: dict) -> dict:
        return {key: job[key] for key in ("state", "submitted", "message")}
