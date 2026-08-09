# Toyota Smart Gate — CEO/CTO Solution Presentation

English HTML slide deck (reveal.js + mermaid) for presenting Phase 1: Kiosk AI Agent and Queue Management.

## Open / present

From the repo root:

```bash
# Option A — open directly (works if CDN is reachable)
xdg-open presentation/index.html

# Option B — local static server (recommended)
cd presentation && python3 -m http.server 8080
# then open http://localhost:8080
```

### Keyboard

| Key | Action |
|-----|--------|
| `→` / `Space` | Next slide |
| `←` | Previous slide |
| `F` | Fullscreen |
| `S` | Speaker notes window |
| `Esc` | Overview grid |
| `B` | Blackout |

## Export to PDF

1. Open the deck with the print stylesheet query:

   ```
   http://localhost:8080/?print-pdf
   ```

2. In Chrome: **Print → Save as PDF**.
3. Enable **Background graphics** so dark theme colors and cards render correctly.
4. Set margins to **None** / **Default**, layout **Landscape**, paper size matching 16:9 if available.

## Contents (17 slides)

1. Title — Phase 1 proposal  
2. The problem at the gate  
3. Two modules, one brain  
4. High-level architecture (mermaid)  
5. Known customer flow — “Is that you?”  
6. Driver-not-owner / voice phone capture  
7. Kiosk conversation map (mermaid)  
8. Voice AI pipeline + API vs on-prem  
9. Queue system overview  
10. 50s claim & growing push-back  
11. Slot → notify → claim sequence (mermaid)  
12. Reliability across N gates  
13. Proposed tech stack  
14. Open questions for CEO/CTO  
15. 6-week Phase 1 plan + Gantt  
16. Phase 2 preview & blockers to start  
17. Closing  

## Design source

Content is aligned with [`../toyota-gate-queue-system-design.md`](../toyota-gate-queue-system-design.md), plus the owner-vs-driver voice phone flow described for the executive pitch.

## Notes

- Requires network access on first load for reveal.js, mermaid, and Google Fonts CDNs.
- Speaker notes are attached on key slides — press `S` while presenting.
