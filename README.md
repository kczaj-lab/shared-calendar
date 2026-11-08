# Shared Calendar

A small shared weekly calendar for three friends: everyone marks when they are busy, and the app suggests time slots when all three are free (minimum 1, 2 or 3 hours, between 08:00 and 23:00).

Built as a vibe-coding learning project with Claude Code.

## Stack

- Plain HTML, CSS and JavaScript — no build step, no frameworks
- [Firebase](https://firebase.google.com/) — Google sign-in + Firestore database
- GitHub Pages — hosting

## Files

| File | Purpose |
|---|---|
| `index.html`, `styles.css` | Page structure and design |
| `app.js` | Calendar UI and app logic |
| `availability.js` | Common free time algorithm (pure functions) |
| `cloud.js`, `firebase-config.js` | Firebase connection (the config is public by design) |
| `firestore.rules` | Database security rules (paste into Firebase console → Firestore → Rules) |
| `tests.html`, `tests.js` | Automated tests for the availability algorithm — open `tests.html` in a browser |
| `serve.ps1` | Local dev server: `powershell -ExecutionPolicy Bypass -File serve.ps1`, then open http://localhost:5500 |

## Access

Only approved members can use the app. To approve someone: they sign in once, then the owner adds a document `members/{uid}` with field `name` (`kasia`, `emilia` or `ola`) in the Firebase console.
