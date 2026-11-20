# NavLog API

Express API + MongoDB.

Render Web Service settings:
- Root Directory: `api`
- Runtime: Node
- Build: `npm install`
- Start: `npm start`
- Health check: `/health`

Required environment:
- `MONGODB_URI`
- `MONGODB_DB=navlog`

Routes:
- `GET /health`
- `POST /api/routes` — create a recording
- `POST /api/routes/:id/points` — append GPS points
- `POST /api/routes/:id/finish` — complete and summarize
- `GET /api/routes?deviceId=...` — list completed routes for a device
- `GET /api/routes/:id` — route detail and points for replay

The server calculates point-to-point distance, speed, marker type and speed-class segments. The client-supplied device ID is a prototype identifier, not authentication.
