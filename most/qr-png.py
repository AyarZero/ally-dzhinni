"""stdin: URL text -> stdout: QR PNG. OpenCV only; no network, no temporary files."""
import sys

import cv2
import numpy as np


def main():
    text = sys.stdin.buffer.read().decode("utf-8")
    if not text or len(text) > 512:
        return 2
    code = cv2.QRCodeEncoder_create().encode(text)
    if code is None:
        return 3
    # Four-module quiet zone is required by scanners; nearest keeps modules crisp.
    code = np.pad(code, ((4, 4), (4, 4)), constant_values=255)
    image = cv2.resize(code, None, fx=8, fy=8, interpolation=cv2.INTER_NEAREST)
    ok, png = cv2.imencode(".png", image)
    if not ok:
        return 4
    sys.stdout.buffer.write(png.tobytes())
    return 0


if __name__ == "__main__":
    sys.exit(main())
