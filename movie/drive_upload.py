#!/usr/bin/env python3
"""
drive_upload.py — put the finished film in Google Drive.

Two supported paths, both dependency-free (urllib only):

  1. OAuth "installed app" token (easiest from your own laptop/desktop):
       export GDRIVE_CLIENT_ID=...   GDRIVE_CLIENT_SECRET=...
       python3 movie/drive_upload.py --file output/Neelu_...mp4 --folder <folder_id>
     The script prints a URL, you paste the code back once, and it caches the
     refresh token in ~/.config/nova/gdrive_token.json (never in the repo).

  2. Service account JSON (best for a server):
       export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
       python3 movie/drive_upload.py --file ... --folder <folder_id>
     (share the target Drive folder with the service-account e-mail first)

  3. No credentials at all: open the film in Drive's web UI and drag it in.
     `python3 movie/drive_upload.py --help-page` prints a 3-step how-to.

This sandbox has no Google credentials and cannot reach oauth2.googleapis.com,
so the upload itself is normally performed by the Arena Drive connection; this
script is what you keep for repeatable, unattended uploads.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import urllib.parse
import urllib.request

TOKEN_CACHE = os.path.expanduser("~/.config/nova/gdrive_token.json")
API = "https://www.googleapis.com/drive/v3"
UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"


def _post(url, data, headers):
    req = urllib.request.Request(url, data=data.encode() if isinstance(data, str) else data,
                                 headers=headers, method="POST")
    return json.load(urllib.request.urlopen(req, timeout=90))


def oauth_refresh_token(client_id, client_secret):
    if os.path.exists(TOKEN_CACHE):
        tok = json.load(open(TOKEN_CACHE))
    else:
        scope = "https://www.googleapis.com/auth/drive.file"
        auth = ("https://accounts.google.com/o/oauth2/v2/auth?"
                + urllib.parse.urlencode({
                    "client_id": client_id, "redirect_uri": "urn:ietf:wg:oauth:2.0:oob",
                    "response_type": "code", "scope": scope, "access_type": "offline"}))
        print("\n1) open this URL in your browser, approve, copy the code:\n\n" + auth + "\n")
        code = input("2) paste the code: ").strip()
        tok = _post("https://oauth2.googleapis.com/token", urllib.parse.urlencode({
            "code": code, "client_id": client_id, "client_secret": client_secret,
            "redirect_uri": "urn:ietf:wg:oauth:2.0:oob", "grant_type": "authorization_code"}),
            {"Content-Type": "application/x-www-form-urlencoded"})
        os.makedirs(os.path.dirname(TOKEN_CACHE), exist_ok=True)
        json.dump(tok, open(TOKEN_CACHE, "w"))
        os.chmod(TOKEN_CACHE, 0o600)
    out = _post("https://oauth2.googleapis.com/token", urllib.parse.urlencode({
        "refresh_token": tok["refresh_token"], "client_id": client_id,
        "client_secret": client_secret, "grant_type": "refresh_token"}),
        {"Content-Type": "application/x-www-form-urlencoded"})
    return out["access_token"]


def service_account_token(path):
    import base64
    import hashlib
    import time
    from urllib.parse import quote_plus
    creds = json.load(open(path))
    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claim = {"iss": creds["client_email"], "scope": "https://www.googleapis.com/auth/drive.file",
             "aud": "https://oauth2.googleapis.com/token", "iat": now, "exp": now + 3600}
    b64 = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=")
    signing = b64(header) + b"." + b64(claim)
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
        key = serialization.load_pem_private_key(creds["private_key"].encode(), password=None)
        sig = key.sign(signing, padding.PKCS1v15(), hashes.SHA256())
    except Exception as exc:                     # pragma: no cover
        raise SystemExit("needs `pip install cryptography` for service-account auth: " + str(exc))
    jwt = (signing + b"." + base64.urlsafe_b64encode(sig).rstrip(b"=")).decode()
    out = _post("https://oauth2.googleapis.com/token",
                f"grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={jwt}",
                {"Content-Type": "application/x-www-form-urlencoded"})
    return out["access_token"]


def upload(path, folder_id, token, name=None):
    name = name or os.path.basename(path)
    size = os.path.getsize(path)
    mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    meta = {"name": name}
    if folder_id:
        meta["parents"] = [folder_id]
    # resumable session
    req = urllib.request.Request(
        UPLOAD + "?uploadType=resumable&fields=id,name,webViewLink,size",
        data=json.dumps(meta).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=UTF-8",
                 "X-Upload-Content-Type": mime, "X-Upload-Content-Length": str(size)},
        method="POST")
    session = urllib.request.urlopen(req, timeout=60).headers["Location"]
    print(f"[drive] uploading {name} ({size/1e6:.1f} MB) -> folder {folder_id or 'My Drive'}")
    with open(path, "rb") as fh:
        data = fh.read()
    put = urllib.request.Request(session, data=data,
                                 headers={"Content-Type": mime, "Content-Length": str(size)},
                                 method="PUT")
    res = json.load(urllib.request.urlopen(put, timeout=1800))
    print(f"[drive] done: {res.get('name')}  id={res.get('id')}\n[drive] link: "
          f"{res.get('webViewLink')}")
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="output/Neelu_aur_Gyaan_ka_Chashma_1080p.mp4")
    ap.add_argument("--folder", default=os.environ.get("GDRIVE_FOLDER_ID", ""))
    ap.add_argument("--name", default=None)
    ap.add_argument("--help-page", action="store_true")
    a = ap.parse_args()

    if a.help_page:
        print(__doc__)
        print("Manual path (no credentials):\n"
              "  1. open https://drive.google.com\n"
              "  2. drag the mp4 from output/ into the folder\n"
              "  3. rename it to 'Neelu aur Gyaan ka Chashma (Hindi Cartoon Story) 1080p'\n")
        return

    if not os.path.exists(a.file):
        sys.exit(f"file not found: {a.file}")

    sa = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    cid, csec = os.environ.get("GDRIVE_CLIENT_ID"), os.environ.get("GDRIVE_CLIENT_SECRET")
    if sa and os.path.exists(sa):
        token = service_account_token(sa)
    elif cid and csec:
        token = oauth_refresh_token(cid, csec)
    else:
        print("No Google credentials in the environment.\n")
        print(__doc__)
        sys.exit(2)
    upload(a.file, a.folder, token, a.name)


if __name__ == "__main__":
    main()
