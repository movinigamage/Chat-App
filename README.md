# Real-Time Chat App on Kubernetes

This project is a practical SIT727 cloud deployment version of a real-time chat
application. The final implementation keeps the working app as one deployable
service and focuses on Docker/Kubernetes evidence: configuration, secrets,
persistence, scaling, health checks, resource limits, and documented deployment
steps.

## Architecture

- `frontend/`: React web client built with Vite.
- `backend/`: Express + Socket.IO API and real-time messaging server.
- `Dockerfile`: Multi-stage build that compiles the frontend and runs the
  backend in one production container.
- `docker-compose.yml`: Local stack with the app, MongoDB, and Redis.
- `k8s/`: Kubernetes manifests for a defensible cloud deployment.

The backend uses MongoDB for users, chats, and message history. Redis is used by
the Socket.IO adapter when `REDIS_URL` is configured, allowing messages to fan
out across multiple app replicas.

Authentication is implemented with password-based login and signed JWTs. User
passwords are stored as PBKDF2 hashes, REST chat APIs require a bearer token,
and Socket.IO connections must present a valid token during the handshake.

## Configuration

Runtime configuration is environment-based. Start from `.env.example` for local
values:

```powershell
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb://localhost:27017/chat-app
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-a-long-random-secret
```

Do not commit real secrets or live database credentials. In Kubernetes,
non-secret values are stored in `k8s/chat-configmap.yaml`, while sensitive
values are stored in `k8s/chat-secret.yaml`.

## Run Locally

Install dependencies:

```powershell
cd frontend
npm install
cd ..\backend
npm install
```

Build the frontend:

```powershell
cd ..\frontend
npm run build
```

Start the backend with environment variables configured:

```powershell
cd ..\backend
npm start
```

Open `http://localhost:3000`.

## Run With Docker Compose

Docker Compose starts the app with MongoDB and Redis:

```powershell
docker compose up --build
```

Open:

```text
http://localhost:3000
http://localhost:3000/healthz
```

## Kubernetes Deployment

The Kubernetes manifests provide:

- Namespace isolation with `chat-app`
- ConfigMap for non-secret app settings
- Secret for `MONGO_URI` and `JWT_SECRET`
- Chat app Deployment with 2 replicas
- ClusterIP Service
- Ingress with WebSocket-friendly timeout annotations
- MongoDB Deployment with PVC persistence
- Redis Deployment and Service for Socket.IO scaling support
- CPU-based HPA
- readiness/liveness probes
- resource requests and limits
- optional safe NetworkPolicy

Apply the manifests:

```powershell
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/chat-configmap.yaml
kubectl apply -f k8s/chat-secret.yaml
kubectl apply -f k8s/mongo-pvc.yaml
kubectl apply -f k8s/mongo-deployment.yaml
kubectl apply -f k8s/redis-deployment.yaml
kubectl apply -f k8s/chat-deployment.yaml
kubectl apply -f k8s/chat-service.yaml
kubectl apply -f k8s/chat-ingress.yaml
kubectl apply -f k8s/chat-hpa.yaml
```

Apply the NetworkPolicy only after confirming your cluster networking supports
it:

```powershell
kubectl apply -f k8s/chat-network-policy.yaml
```

Check deployment evidence:

```powershell
kubectl get all -n chat-app
kubectl get pvc -n chat-app
kubectl get configmap -n chat-app
kubectl get secret -n chat-app
kubectl get hpa -n chat-app
kubectl describe deployment chat-app -n chat-app
kubectl logs deployment/chat-app -n chat-app
```

Port-forward fallback for local demo:

```powershell
kubectl port-forward service/chat-service 3000:80 -n chat-app
```

Then open:

```text
http://localhost:3000
http://localhost:3000/healthz
```

## Rolling Update Demo

The app Deployment uses a rolling update strategy:

- `maxUnavailable: 1`
- `maxSurge: 1`

This supports a zero/low-downtime update demonstration when changing image tags:

```powershell
kubectl set image deployment/chat-app chat-container=chat-app:new-tag -n chat-app
kubectl rollout status deployment/chat-app -n chat-app
```

## Scaling Demo

The HPA scales the chat app between 2 and 10 replicas using CPU utilization:

```powershell
kubectl get hpa -n chat-app
kubectl describe hpa chat-hpa -n chat-app
```

The original 4.2HD plan mentioned custom WebSocket metrics through Prometheus.
For the final practical version, CPU-based HPA is used because it is simpler,
demonstrable, and less risky within the available timeframe.

## Alignment With The 4.2HD Plan

Implemented cloud architecture evidence:

- Dockerized real-time chat app
- JWT-protected REST APIs and Socket.IO connections
- Kubernetes Namespace, ConfigMap, Secret, Deployment, Service, and Ingress
- MongoDB persistence using a PVC
- Redis support for multi-replica Socket.IO message fanout
- HPA with CPU-based scaling
- readiness/liveness probes
- resource requests and limits
- safe NetworkPolicy option
- documented local, Docker, and Kubernetes deployment workflows

Documented simplifications from the 4.2HD check-in:

- Auth and chat remain in one backend service instead of separate microservices.
- The frontend is built into the same production image and served by Express,
  rather than a separate Nginx frontend service.
- Group channels and file upload are not implemented in this final version.
- Prometheus/Grafana, custom WebSocket HPA metrics, GKE deployment evidence,
  CI/CD, and load testing are left as future improvements.

These simplifications keep the existing working application stable while still
demonstrating the major Kubernetes and cloud deployment concepts required for a
defensible final presentation.
