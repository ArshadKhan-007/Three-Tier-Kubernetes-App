# 🧱 Three-Tier Task Manager on Kubernetes

**React → FastAPI → MySQL, fully containerized and deployed on Kubernetes (kind).**

![React](https://img.shields.io/badge/Frontend-React_19_+_Vite-149eca?logo=react&logoColor=white) [![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white) [![MySQL](https://img.shields.io/badge/Database-MySQL_8-4479A1?logo=mysql&logoColor=white)](https://img.shields.io/badge/Database-MySQL_8-4479A1?logo=mysql&logoColor=white) [![Docker](https://img.shields.io/badge/Containerized-Docker-2496ED?logo=docker&logoColor=white)](https://img.shields.io/badge/Containerized-Docker-2496ED?logo=docker&logoColor=white) [![Kubernetes](https://img.shields.io/badge/Orchestration-Kubernetes-326CE5?logo=kubernetes&logoColor=white)](https://img.shields.io/badge/Orchestration-Kubernetes-326CE5?logo=kubernetes&logoColor=white) [![Nginx](https://img.shields.io/badge/Web_Server-Nginx-009639?logo=nginx&logoColor=white)](https://img.shields.io/badge/Web_Server-Nginx-009639?logo=nginx&logoColor=white)

A small Task Manager app used as a hands-on reference for **containerizing a multi-tier app and deploying it to Kubernetes** — Deployments, StatefulSets, Services, ConfigMaps, Secrets, and per-pod persistent storage, all wired together.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Request Flow](#-request-flow-create-a-task)
- [Folder Structure](#-folder-structure)
- [API Reference](#-api-reference)
- [Getting Started](#-getting-started)
  * [Option A — Docker Compose (local dev)](#option-a--docker-compose-local-dev)
  * [Option B — Kubernetes with kind](#option-b--kubernetes-with-kind)
- [Environment Variables](#-environment-variables)
- [Useful Commands](#-useful-commands)
- [Known Issues](#-known-issues--things-worth-fixing)
- [License](#-license)

---

## 📖 Overview

The app is a minimal task manager: add a task, view the list, delete a task. That's it — the point isn't the feature set, it's the **infrastructure around it**:

- **Frontend** — React (Vite) SPA, built into static files and served by Nginx. Nginx also reverse-proxies `/api/*` to the backend so the browser only ever talks to one origin.
- **Backend** — FastAPI, layered into `api / core / models / schemas`, talking to MySQL via SQLAlchemy + PyMySQL.
- **Database** — MySQL 8, with schema created automatically on backend startup (`Base.metadata.create_all`). Runs as a **StatefulSet** with a headless Service, since a database is stateful workload and needs stable identity + per-pod storage — not a stateless `Deployment`.
- **Runtime** — every tier has its own Dockerfile. `docker-compose.yml` runs all three locally; the `K8s/` manifests run the same three tiers as a real cluster workload (frontend/backend Deployments + Services, MySQL StatefulSet + headless Service, ConfigMap, Secret, and dynamically-provisioned per-pod storage via `volumeClaimTemplates`).

---

## 🧰 Tech Stack

| Layer                 | Technology                                          |
| --------------------- | --------------------------------------------------- |
| Frontend              | React 19 + Vite, Axios                              |
| Web server (frontend) | Nginx (reverse proxy to backend)                    |
| Backend               | FastAPI + SQLAlchemy + PyMySQL, Uvicorn             |
| Database              | MySQL 8                                             |
| Containerization      | Docker (multi-stage build for frontend)             |
| Local orchestration   | Docker Compose                                      |
| Cluster orchestration | Kubernetes (tested with `kind`)                     |
| Config / secrets      | ConfigMap + Secret                                  |
| Persistence           | StatefulSet `volumeClaimTemplates` bound to a static hostPath PV (kind-only) |

---

## 🏗 Architecture

Only the frontend is reachable from outside the cluster — backend and MySQL stay `ClusterIP`-only, so the frontend can't be bypassed to hit the database directly.

MySQL runs as a **StatefulSet** (not a Deployment) behind a **headless Service** (`clusterIP: None`), giving it a stable pod identity (`mysql-0`) and a dedicated, per-pod PVC created automatically from `volumeClaimTemplates`. That PVC statically binds to `mysql-pv` (a hostPath PV, `storageClassName: ""` on both sides so `kind`'s default `local-path` provisioner doesn't intercept it) — kept intentional so data lands at a known path on the host for a `kind` cluster; a production cluster would drop the static PV and let a cloud CSI driver provision dynamically instead.

```mermaid
flowchart TD
    U["🧑 Browser"] -->|"http://localhost:hostPort"| FESVC["Frontend Service<br/>NodePort :30080"]
    FESVC --> FEPOD["React + Nginx Pod<br/>serves static build"]
    FEPOD -->|"/api/* proxy_pass"| BESVC["Backend Service<br/>ClusterIP :8000"]
    BESVC --> BEPOD["FastAPI Pod<br/>/api/v1/items"]
    BEPOD -->|"SQLAlchemy / PyMySQL"| DBSVC["mysql-service<br/>Headless (ClusterIP: None) :3306"]
    DBSVC --> DBPOD["mysql-0 (StatefulSet pod)"]
    DBPOD --> PVC["PVC: mysql-storage-mysql-0<br/>(auto-created, 1Gi)"]
    PVC --> PV["PV: mysql-pv<br/>static hostPath (storageClassName: '')"]

    CM["ConfigMap: backend-config<br/>DB_HOST, DB_PORT"] -.-> BEPOD
    SEC["Secret: mysql-secret<br/>root password, db name"] -.-> BEPOD
    SEC -.-> DBPOD

    classDef fe fill:#0b3a4a,stroke:#61dafb,stroke-width:2px,color:#fff
    classDef be fill:#0b3d38,stroke:#009688,stroke-width:2px,color:#fff
    classDef db fill:#10263a,stroke:#4479a1,stroke-width:2px,color:#fff
    classDef cfg fill:#2e2408,stroke:#b58900,stroke-width:2px,color:#fff
    classDef ext fill:#1c1c1c,stroke:#888,stroke-width:2px,color:#fff

    class FESVC,FEPOD fe
    class BESVC,BEPOD be
    class DBSVC,DBPOD,PVC,PV db
    class CM,SEC cfg
    class U ext
```

All three tiers run inside the `task-manager` namespace.

---

## 🔁 Request Flow (create a task)

```mermaid
sequenceDiagram
    actor User
    participant Frontend as React SPA
    participant Nginx as Nginx (/api proxy)
    participant Backend as FastAPI
    participant DB as MySQL

    User->>Frontend: Type title, submit form
    Frontend->>Nginx: POST /api/v1/items { title }
    Nginx->>Backend: proxy_pass → backend-service:8000
    Backend->>DB: INSERT INTO tasks (title)
    DB-->>Backend: new row (id, title)
    Backend-->>Nginx: 200 OK, task JSON
    Nginx-->>Frontend: response
    Frontend-->>User: task appended to the list
```

Delete follows the same path: `DELETE /api/v1/items/{id}` → 404 if the task doesn't exist, otherwise the row is removed and the UI drops it from state.

---

## 📁 Folder Structure

```
.
├── K8s/
│   ├── namespace.yml
│   ├── backend/
│   │   ├── ConfigMap.yml
│   │   ├── deployment.yml
│   │   └── service.yml
│   ├── frontend/
│   │   ├── deployment.yml
│   │   └── service.yml
│   └── mysql/
│       ├── statefulset.yml          # StatefulSet (was deployment.yml)
│       ├── service.yml              # headless Service, clusterIP: None
│       ├── secret.yml
│       └── pv.yml                   # static hostPath PV — kind-only, see note below
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                  # FastAPI app, CORS, /health
│       ├── dependencies.py          # DB session dependency
│       ├── core/
│       │   └── database.py          # engine, SessionLocal, Base
│       ├── models/
│       │   └── task.py              # SQLAlchemy Task model
│       ├── schemas/
│       │   └── task.py              # Pydantic TaskCreate / TaskResponse
│       └── api/v1/
│           ├── router.py
│           └── endpoints/
│               └── items.py         # GET / POST / DELETE /items
│
├── frontend/
│   ├── Dockerfile                   # multi-stage: node build → nginx serve
│   ├── nginx.conf                   # static files + /api reverse proxy
│   └── src/
│       ├── main.jsx / App.jsx
│       ├── pages/Home.jsx
│       ├── components/tasks/        # TaskForm, TaskList, TaskCard
│       ├── hooks/useTasks.js        # fetch/add/delete state logic
│       ├── services/                # apiClient.js, taskService.js
│       └── constants/api.js
│
├── docker-compose.yml
└── README.md
```

> ⚠️ Note the real casing: it's `K8s/`, not `k8s/`, and the manifests are `.yml`, not `.yaml`. Every `kubectl apply -f k8s/...` command floating around in older docs for this repo will fail on a case-sensitive filesystem — the commands below use the actual paths.
>
> `K8s/mysql/pvc.yml` is gone — storage is now provisioned per-pod by the StatefulSet's `volumeClaimTemplates`, not a manually-written PVC. `pv.yml` is kept as a **static hostPath PV bound directly to `volumeClaimTemplates`** (`storageClassName: ""` on both sides) — this is a `kind`-specific choice for full control over where data lands on the host. On a real cluster (e.g. EKS with the EBS CSI driver), `pv.yml` would be deleted entirely and `volumeClaimTemplates` would reference the cloud provider's StorageClass for dynamic provisioning instead — writing a static PV by hand isn't the pattern there.

---

## 🔌 API Reference

Base path: `/api/v1`

| Method | Endpoint             | Body                  | Description                                               |
| ------ | -------------------- | ---------------------- | --------------------------------------------------------- |
| GET    | `/health`            | —                      | Liveness/readiness check, returns `{"status": "healthy"}` |
| GET    | `/api/v1/items`      | —                      | List all tasks                                            |
| POST   | `/api/v1/items`      | `{ "title": string }` | Create a task                                             |
| DELETE | `/api/v1/items/{id}` | —                      | Delete a task by id, `404` if missing                     |

There's no update/edit endpoint currently — tasks are create-or-delete only.

---

## 🚀 Getting Started

### Prerequisites

- Docker
- For Kubernetes: `kubectl` and `kind`

### Option A — Docker Compose (local dev)

> ⚠️ **Current limitation:** `frontend/nginx.conf` proxies to `http://backend-service:8000` — a hostname that only resolves inside Kubernetes (it's the K8s `Service` name). Compose's internal DNS resolves by **compose service key** instead (`backend`, not `backend-service`), so **as currently configured, the frontend container fails to start under Compose** (`nginx: [emerg] host not found in upstream "backend-service"`). This was a deliberate tradeoff made while focusing on the Kubernetes deployment path — see [Known Issues](#-known-issues--things-worth-fixing) for the proper long-term fix. To run Compose locally right now, temporarily change that line to `proxy_pass http://backend:8000;` and rebuild.

The compose file expects two env files that are **gitignored on purpose** (they hold DB credentials) — create them yourself first, using exact `KEY=VALUE` syntax (not `KEY: VALUE` — that's YAML syntax, and Compose's env file parser silently fails to pick it up):

```
# backend/.env.backend
DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_PASSWORD=choose-a-password
DB_NAME=task_manager
```

```
# .env.db  (repo root)
MYSQL_ROOT_PASSWORD=choose-a-password   # must match DB_PASSWORD above, character-for-character
MYSQL_DATABASE=task_manager
```

`docker-compose.yml`'s `mysql` service also needs a healthcheck so the backend actually waits for MySQL to accept connections instead of racing it on first boot:

```
mysql:
  image: mysql:8
  container_name: task-manager-mysql
  ports:
    - "3306:3306"
  env_file:
    - .env.db
  volumes:
    - mysql_data:/var/lib/mysql
  healthcheck:
    test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
    interval: 5s
    timeout: 5s
    retries: 10
    start_period: 10s
  restart: unless-stopped

backend:
  build:
    context: ./backend
  container_name: task-manager-backend
  ports:
    - "8000:8000"
  env_file:
    - ./backend/.env.backend
  depends_on:
    mysql:
      condition: service_healthy   # waits for the healthcheck above, not just "container started"
  restart: unless-stopped
```

Then:

```
git clone https://github.com/ArshadKhan-007/Three-Tier-Kubernetes-App.git
cd Three-Tier-Kubernetes-App
docker compose down -v          # if re-running: wipe any stale mysql volume first —
                                 # MySQL only reads MYSQL_ROOT_PASSWORD on first init,
                                 # a leftover volume silently ignores new env files
docker compose up --build
```

- Frontend → <http://localhost:3000>
- Backend → <http://localhost:8000/docs> (Swagger UI)
- Sanity check: `curl http://localhost:8000/health` → `{"status":"healthy"}`

### Option B — Kubernetes with kind

`kind` does **not** expose NodePort services to your host by default — you need a cluster config with an explicit port mapping, or the app will deploy fine and still be unreachable.

```yaml
# kind-config.yml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 30080   # must match nodePort in K8s/frontend/service.yml — do not change
        hostPort: 30080        # the port YOU access on localhost — change this to whatever you like (e.g. 3001)
        protocol: TCP
```

> `containerPort` and `hostPort` are not the same thing. `containerPort` has to stay `30080` because that's the `nodePort` hardcoded in `K8s/frontend/service.yml` — that's the fixed end of the chain. `hostPort` is just where *you* want it reachable on your machine; set it to `3001`, `8080`, whatever's free. If your `kind-config.yml` has `hostPort: 3001`, then the app is at `http://localhost:3001`, not `:30080` — the example below uses `30080` for both since that's the default, but swap in your actual `hostPort` value.

```
kind create cluster --name three-tier --config kind-config.yml
kubectl cluster-info
```

Deploy in order (mysql before backend, backend before frontend — nothing here waits on readiness across resources):

```
kubectl apply -f K8s/namespace.yml
kubectl apply -f K8s/mysql/
kubectl apply -f K8s/backend/
kubectl apply -f K8s/frontend/
```

Watch it come up (MySQL pod will come up as `mysql-0`, not a random hash suffix — that's the StatefulSet giving it a stable name):

```
kubectl get pods -n task-manager -w
```

Once everything is `Running`, open **http://localhost:\<your hostPort\>** — `http://localhost:30080` only if you kept the default; check your own `kind-config.yml` if you changed it.

Didn't set up the port mapping, or on a cluster where NodePort isn't reachable? Fall back to port-forwarding:

```
kubectl port-forward svc/frontend-service 3000:80 -n task-manager
# → http://localhost:3000
```

---

## 🔐 Environment Variables

### Backend (`backend/app/core/database.py`)

| Variable      | Default        | Used for            |
| ------------- | -------------- | -------------------- |
| `DB_HOST`     | `localhost`    | MySQL host           |
| `DB_PORT`     | `3306`         | MySQL port           |
| `DB_USER`     | `xyz`          | MySQL user           |
| `DB_PASSWORD` | `RtabcPass`    | MySQL password        |
| `DB_NAME`     | `task_manager` | MySQL database name  |

In Kubernetes, `DB_HOST`/`DB_PORT` come from the `backend-config` ConfigMap, and `DB_PASSWORD`/`DB_NAME` come from the `mysql-secret` Secret. `DB_USER` is hardcoded to `root` directly in `K8s/backend/deployment.yml`.

---

## 🛠 Useful Commands

```
# Pods / services / deployments / statefulsets
kubectl get pods -n task-manager
kubectl get svc -n task-manager
kubectl get deployments -n task-manager
kubectl get statefulsets -n task-manager
kubectl get pvc -n task-manager

# Logs
kubectl logs -f deployment/backend -n task-manager
kubectl logs -f deployment/frontend -n task-manager
kubectl logs -f statefulset/mysql -n task-manager
# or, since it's a named pod:
kubectl logs -f mysql-0 -n task-manager

# Shell into a pod
kubectl exec -it deployment/backend -n task-manager -- /bin/bash
kubectl exec -it mysql-0 -n task-manager -- mysql -u root -p

# Tear down
kubectl delete -f K8s/frontend/
kubectl delete -f K8s/backend/
kubectl delete -f K8s/mysql/
kubectl delete -f K8s/namespace.yml
kind delete cluster --name three-tier
```

---

## ⚠️ Known Issues / Things Worth Fixing

Called out plainly, since this repo is being used to demonstrate DevOps chops and an interviewer will spot these in about thirty seconds. Split by status so it's clear what's actually been dealt with vs. what's still sitting there.

### ✅ Resolved (found and fixed during local debugging)

1. **`.env.db` used YAML syntax (`KEY: VALUE`) instead of env-file syntax (`KEY=VALUE`).** Compose's env-file parser doesn't error on this — it just silently doesn't set the variable. Fixed by switching to `=`.
2. **Root password mismatch between `.env.db` and `backend/.env.backend`.** MySQL sets its real root password from `MYSQL_ROOT_PASSWORD` only on first init; the backend has to match it exactly or every query fails with `1045 Access denied`. Fixed by aligning both values.
3. **Stale Docker volume masked the two issues above.** `mysql_data` had already been initialized by an earlier run, so new env files had zero effect until the volume was wiped with `docker compose down -v`. Worth remembering any time a "fix" to an env file doesn't seem to change behavior — check for a stale volume before assuming the fix is wrong.
4. **`frontend/nginx.conf` had a stray shell command pasted into it** — `location /api/ {kubectl logs $(kubectl get pod ...)` — which made Nginx refuse to start (`unknown directive "kubectl"`). Fixed by removing the pasted text.
5. **No readiness gate between MySQL and the backend in Compose.** `depends_on: mysql` only waits for the container to *start*, not for MySQL to actually accept connections, so the backend hit `Connection refused` on first boot. Fixed by adding a `healthcheck` to the `mysql` service and `depends_on.mysql.condition: service_healthy` on the backend.
6. **MySQL ran as a `Deployment` with a static, manually-authored PV/PVC pair.** A database is stateful — the right primitive is a `StatefulSet` with stable pod identity (`mysql-0`) and per-pod storage. Converted to a `StatefulSet` behind a headless Service (`clusterIP: None`); replaced the hand-written `pvc.yml` with `volumeClaimTemplates` so the PVC is generated per-pod automatically, while keeping the static hostPath `pv.yml` (`storageClassName: ""`) since this only runs on `kind` — a production cluster with a cloud CSI driver would drop the static PV and rely on dynamic provisioning instead.

### 🚧 Open

7. **`frontend/nginx.conf` currently hardcodes `backend-service`** (the Kubernetes Service name), which means **it does not resolve under Docker Compose** (Compose uses the service key `backend` instead). This is a real environment-coupling problem: the same image can't currently serve both deployment targets. Proper fix is an Nginx config *template* (`default.conf.template`) with `proxy_pass http://${BACKEND_HOST}:8000;`, using the image's built-in `envsubst` entrypoint hook, and passing `BACKEND_HOST=backend` in Compose vs. `BACKEND_HOST=backend-service` in the K8s Deployment.
8. **`K8s/mysql/secret.yml` has a hardcoded, committed credential.** Base64 is encoding, not encryption — `MYSQL_ROOT_PASSWORD` decodes straight to a plaintext password. Committing real (or real-looking) secrets to git is one of the first things reviewers flag. Move it to a value injected at deploy time (`kubectl create secret` imperatively, Sealed Secrets, SOPS, or an external secrets manager), and rotate it since it's now public in this repo's history.
9. **Backend connects to MySQL as `root`.** Works, but it's not least-privilege. A dedicated `task_manager_app` user scoped to just that database is the correct setup for anything beyond a demo.
10. **`frontend/src/app.jsx` is an empty duplicate of `App.jsx`.** Harmless on Linux, but a landmine on case-insensitive filesystems (macOS/Windows) where git can end up tracking two entries for what the OS sees as one file. Delete it.
11. **No readiness gate between tiers in Kubernetes either** — same class of race as issue #5, just not yet fixed on the K8s side. The backend's `readinessProbe` checks its own `/health`, not whether MySQL is reachable.
12. **No update endpoint.** Tasks can be created and deleted but not edited — fine for a demo, worth mentioning if the API is presented as complete.



## 📄 License

No license file is currently included in this repository — treat it as **all rights reserved** by default until one is added. If the intent is for others to freely use/modify this (which is reasonable for a learning project), add an explicit `LICENSE` file (MIT is the standard low-friction choice for this kind of project).
