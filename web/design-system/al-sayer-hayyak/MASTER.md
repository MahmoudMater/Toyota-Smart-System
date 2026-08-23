# Al Sayer Hayyak — Design System (MASTER)

> Logo-aligned override of ui-ux-pro-max recommendations. Reference: `public/alsayer.jpeg`

## Brand

- **Product:** Toyota Smart Gate / Al-Sayer Hayyak kiosk + queue ops
- **Mode:** Dark OLED only — no light theme
- **Aesthetic:** Electric cyan particle glow, HUD glass panels, waveform atmosphere (not matrix-green cyberpunk)

## Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-deep` | `#02060D` | Page background |
| `--bg-base` | `#061018` | Secondary gradient stop |
| `--surface` | `rgba(0, 180, 255, 0.06)` | Panel fill |
| `--border` | `rgba(62, 203, 255, 0.22)` | Hairline borders |
| `--accent` | `#00B4FF` | Primary CTA, glow |
| `--accent-bright` | `#3ECBFF` | Highlights, hover |
| `--foreground` | `#E8F4FF` | Body text |
| `--muted` | `#7BA3C4` | Labels, secondary |
| `--ok` | `#2EE6A6` | Success / Yes |
| `--danger` | `#FF5C6C` | Error / No |
| `--warn` | `#FFB347` | Notified / pending |

## Typography

- **Display:** Space Grotesk — headings, nav
- **Body:** DM Sans — UI copy, prompts
- **Mono:** JetBrains Mono — status, logs, session JSON
- **Arabic (future):** Noto Naskh Arabic / Noto Sans Arabic

## Components

- **HudPanel:** glass surface, 12px radius, subtle cyan border + inner glow
- **GlowButton:** min 44×44px touch; primary = accent fill; secondary = surface; ok/danger variants
- **Keypad:** 3×4 grid, 44px+ keys, 8px gap
- **StatusDot:** 8px circle; green = connected, red = disconnected
- **Badge:** pill status for queue entries

## Motion

- Transitions: 150–300ms ease
- Panel stagger on load (optional)
- `prefers-reduced-motion: reduce` disables glow pulse and stagger

## Icons

Phosphor outline (`@phosphor-icons/react`) — no emoji as icons

## Avoid

- Light mode, Inter/Geist as primary fonts, purple-on-white gradients, raw hex in components (use CSS vars)
