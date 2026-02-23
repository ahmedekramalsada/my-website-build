# Master Project Guide: Universal Website Builder Platform (UWBP)

This is the single source of truth for the project. It merges understanding of the existing system with the strict roadmap for full completion.

## 1. System Architecture
**Status: Foundations Solid (~40% complete)**

- **Control Plane API:** Node.js/Express backend (`control-plane/api`).
- **Control Plane Dashboard:** React frontend (`control-plane/dashboard`).
- **Infrastructure:** Traefik v3 (routing/SSL), PostgreSQL (7 tables), Prometheus + Grafana.
- **Orchestration Tooling:** Local Docker engine (currently handled by `dockerode`).

## 2. Core Missing Features (The "One-Tap" Flow)

To make the system functional as designed, we must implement the wiring to go from "Source Code" to "Running Container".

### Deploy Flow Steps:
1. **Source Input:** GitHub URL or ZIP Upload.
2. **Retrieval:** `git clone` or ZIP extraction to a temporary build directory.
3. **Detection:** Auto-detect the framework (Next.js, React, Node, Python, PHP, Go, Static).
4. **Dockerfile Generation:** If no Dockerfile exists, generate one based on the detected framework.
5. **Image Build:** Command docker to build the image from the folder.
6. **Container Run:** Start the container with appropriate labels for Traefik routing.

## 3. Strict Implementation Roadmap (Follow Exactly)

We will execute this plan sequentially, testing every single step before moving to the next.

### Phase 1: Critical Fixes (Backend Auth & Setup)
- [ ] Implement `src/utils/api.js` in the React dashboard with an Axios JWT interceptor. Replace all direct `axios` calls.
- [ ] Fix the Admin Seed Password in `scripts/seed.js` (currently uses an invalid bcrypt hash).
- [ ] Restrict Backend CORS in `app.js` to only allow the dashboard domain.

### Phase 2: Core Git Deployment Engine
- [ ] Create `src/services/gitService.js` with framework detection and Dockerfile generation.
- [ ] Add `buildImage()` method to `src/services/dockerService.js`.
- [ ] Test the pipeline manually (clone a public repo + build it).

### Phase 3: Asynchronous Deployments (Crucial Reliability Fix)
- [ ] Install `bullmq` and configure Redis connection.
- [ ] Create `src/workers/deployWorker.js` to move slow Docker builds out of the HTTP request thread.
- [ ] Update `websites.js` deploy route to push jobs to the queue instead of awaiting completion.
- [ ] Implement WebSocket log streaming (`src/utils/websocket.js` and wire to `app.js`).
- [ ] Add `LogStream` component to the frontend (`WebsiteDetail.js`).

### Phase 4: Frontend UI & Webhooks integrations
- [ ] Add GitHub URL/Branch/Command inputs to `CreateWebsite.js`.
- [ ] Add Webhook endpoint (`POST /api/websites/:id/webhook`) for auto-deploy on `git push`.
- [ ] Implement Rollback endpoint (`POST /api/deployments/:id/rollback`).

### Phase 5: Upload Pipeline & Production Hardening
- [ ] Create `src/services/uploadService.js` to extract ZIPs and trigger builds.
- [ ] Wire metrics collection (`metricsWorker.js`).
- [ ] Add container health checks.
- [ ] Implement Environment Variable encryption `src/utils/encryption.js`.
- [ ] Run API container as non-root.

### Phase 6: Advanced Deployment Types
- [ ] Implement Docker Compose deployment support (`composeService.js`).
- [ ] Update Database schema to support the `compose` template type.

## Testing Protocol
Every completed phase requires:
1. Server/Client restart.
2. Manual verification through the UI or via Postman/cURL.
3. Confirmation of correct database state.
4. Git commit before moving to the next phase.
