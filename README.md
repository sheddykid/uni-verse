

---

## 12. Video playback CSP fix — production verified (2026-11-22)

The user confirmed that course video playback works on the production site after correcting the browser's Content Security Policy.

### Root cause

- The original video object in the private Cloudflare R2 bucket was intact. Integrity checks confirmed its file size, MP4 container structure, H.264 video track and AAC audio track.
- The signed playback URL and R2 byte-range requests returned valid responses.
- The browser rejected the source with media error 4 because the effective Content Security Policy did not permit the R2 origin in `media-src`. The browser diagnostic identified an enforced `media-src` violation and a media load rejected by the URL safety check.

### Resolution

- Updated the Vercel CSP in `vercel.json` to allow both the R2 wildcard and the bucket's exact R2 hostname in `media-src` and `connect-src`.
- Added a route-specific `Cache-Control: no-store, max-age=0, must-revalidate` header for `/videos.html` to prevent stale video-page policy responses.
- Kept the R2 bucket private and retained the existing short-lived signed playback URL flow.
- No video re-upload, re-encoding, or database schema change was required.

### Production verification

- [x] Original R2 video integrity verified.
- [x] Signed URL and byte-range response verified.
- [x] Live production response returned HTTP 200.
- [x] Live production CSP explicitly permits the R2 origin in `media-src` and `connect-src`.
- [x] Video page response includes the no-store cache policy.
- [x] User confirmed that playback works in the production application.

### Relevant commits

- CSP diagnostics: [073a44b](https://github.com/sheddykid/uni-verse/commit/073a44b0308d6de1608a83f5cf2a0538749c5ea4)
- Prevent stale video-page CSP caching: [016cb48](https://github.com/sheddykid/uni-verse/commit/016cb487e5a8ef1a5da64dad688756fb324e6245)
