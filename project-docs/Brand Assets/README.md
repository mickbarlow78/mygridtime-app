# MyGridTime Brand Assets

## Font
Wordmark uses **JetBrains Mono Light (300)**, lowercase, wide letter-spacing.
"grid" in Signal Green (#00C853), rest in white (dark bg) or Midnight (light bg).

SVGs reference JetBrains Mono via Google Fonts import. For offline use, 
install JetBrains Mono locally. Fallback: DejaVu Sans Mono → Consolas → monospace.

PNGs use DejaVu Sans Mono (metrically similar to JetBrains Mono).

## Colour Reference
| Name | Hex |
|------|-----|
| Midnight | #0F1A2E |
| Signal Green | #00C853 |
| Slate | #1E293B |
| Cool Grey | #6B7280 |
| Light Grey | #F3F4F6 |

## File Structure

### svg/
Scalable vectors — use these for web, print, and as source files for any designer.

- **icon/** — 3×3 grid icon mark (midnight, green, mono, transparent)
- **wordmark/** — Text-only wordmark in all colour variants + tagline versions
- **lockup/** — Icon + wordmark combined (horizontal and stacked)
- **social/** — OG image, powered-by footer, watermarks

### png/
Rasterised versions at specific sizes.

- **icon/** — 512, 192, 180, 64, 32, 16px × 5 variants each
- **wordmark/** — Large (1200px), medium (600px), small (400px) × 7 variants
- **lockup/** — Horizontal (3 sizes × 4 variants) + stacked (2 sizes × 4 variants)
- **social/** — OG 1200×630, Twitter 1500×500, LinkedIn 1584×396, avatar, email header, footer, watermarks

## Usage Guide
| Context | File to use |
|---------|------------|
| Website nav | svg/lockup/lockup-horizontal-dark.svg |
| App icon (Android/iOS) | png/icon/icon-512x512-midnight.png |
| Favicon | png/icon/icon-32x32-favicon-midnight.png |
| Apple touch icon | png/icon/icon-180x180-apple-touch-midnight.png |
| Social share | png/social/og-image-1200x630.png |
| Email header | png/social/email-header-600x80.png |
| White-label footer | svg/social/powered-by-footer.svg |
| Print (single colour) | svg/wordmark/wordmark-mono-dark-transparent.svg |
| Photo overlay | svg/social/watermark-white.svg |
| Merch / sticker | svg/lockup/lockup-stacked-dark.svg |

## Social Platform Logo Guide

### Twitter / X
| Slot | Size | File |
|------|------|------|
| Profile photo | 400×400 (displays as circle) | png/social/avatar-400x400-midnight.png |
| Header banner | 1500×500 | png/social/twitter-header-1500x500.png |
| Shared link preview | 1200×630 (auto from OG tag) | png/social/og-image-1200x630.png |

Profile photo crops to a circle — the grid icon centred on Midnight works perfectly. Never use the wordmark as a profile photo; it won't be legible at 48px display size. Display name: **MyGridTime**. Handle: **@MyGridTime**. Bio should include the tagline: "Never miss your race."

### Instagram
| Slot | Size | File |
|------|------|------|
| Profile photo | 400×400 (displays as circle) | png/social/avatar-400x400-midnight.png |
| Story highlight cover | 400×400 | png/social/avatar-400x400-midnight.png |

Same circular avatar as Twitter. For story highlight covers, use the icon on Midnight or create category-specific covers using the grid icon with brand colours. No wordmark in profile photo. Display name: **MyGridTime**.

### LinkedIn
| Slot | Size | File |
|------|------|------|
| Company logo | 400×400 | png/social/avatar-400x400-midnight.png |
| Company banner | 1584×396 | png/social/linkedin-banner-1584x396.png |
| Shared link preview | 1200×630 (auto from OG tag) | png/social/og-image-1200x630.png |

LinkedIn displays the company logo as a square with rounded corners. The grid icon on Midnight works well here. The banner uses horizontal lockup centred on Midnight. Company name: **MyGridTime**. Tagline field: "Never miss your race."

### Facebook
| Slot | Size | File |
|------|------|------|
| Profile photo | 400×400 | png/social/avatar-400x400-midnight.png |
| Cover photo | 1200×630 | png/social/og-image-1200x630.png |
| Shared link preview | 1200×630 (auto from OG tag) | png/social/og-image-1200x630.png |

Profile photo displays as circle on mobile, square with rounded corners on desktop. Use the icon avatar for both. The OG image doubles as a cover photo. Page name: **MyGridTime**.

### YouTube
| Slot | Size | File |
|------|------|------|
| Channel icon | 400×400 | png/social/avatar-400x400-midnight.png |
| Banner | 1500×500 (safe area) | png/social/twitter-header-1500x500.png |

YouTube banners display differently across devices. The Twitter header image works because the lockup is horizontally centred — it stays visible in the safe area across desktop, mobile and TV. Channel icon displays as circle.

### TikTok
| Slot | Size | File |
|------|------|------|
| Profile photo | 400×400 (displays as circle) | png/social/avatar-400x400-midnight.png |

TikTok only uses a profile photo. Same circular icon avatar. Display name: **MyGridTime**. Username: **@mygridtime**.

### WhatsApp Business
| Slot | Size | File |
|------|------|------|
| Profile photo | 400×400 | png/social/avatar-400x400-midnight.png |

Square crop, displays small. Icon mark on Midnight. Business name: **MyGridTime**.

### Email (Resend / transactional)
| Slot | Size | File |
|------|------|------|
| Header logo | 600×80 | png/social/email-header-600x80.png |
| Footer "powered by" | 300×30 | svg/social/powered-by-footer.svg |

Email header uses horizontal lockup on Midnight. Keep it under 100px tall in the email template so it doesn't dominate the message. For white-label event emails, use the powered-by footer SVG.

### App Store / Google Play
| Slot | Size | File |
|------|------|------|
| App icon | 512×512 | png/icon/icon-512x512-midnight.png |
| Feature graphic (Google Play) | 1024×500 — create from OG image | png/social/og-image-1200x630.png (crop/resize) |

App icon: grid icon on Midnight, no transparency. iOS clips to rounded square automatically — do not add your own rounding. Android uses adaptive icons — the grid pattern on Midnight works as the foreground layer.

### PWA / Browser
| Slot | Size | File |
|------|------|------|
| manifest.json icon 512 | 512×512 | png/icon/icon-512x512-midnight.png |
| manifest.json icon 192 | 192×192 | png/icon/icon-192x192-android-midnight.png |
| Apple touch icon | 180×180 | png/icon/icon-180x180-apple-touch-midnight.png |
| Favicon | 32×32 | png/icon/icon-32x32-favicon-midnight.png |

Set `theme_color` and `background_color` in manifest.json to `#0F1A2E` (Midnight).

### General Rules
- **Profile photos / avatars**: Always use the grid icon mark, never the wordmark. Text is illegible at avatar display sizes.
- **Banners / covers**: Use horizontal lockup or OG image. Wordmark is legible at these sizes.
- **Display name**: Always "MyGridTime" (one word, capital M, G, T) across all platforms.
- **Bio / tagline**: "Never miss your race." on every platform that supports it.
- **Link**: mygridtime.com everywhere.
- **Hashtag**: #MyGridTime

Prepared by LB42 Ltd (trading as Kion Technology). March 2026.
