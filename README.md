# Real-Time Chat App on Kubernetes

This repository contains my SIT727 real-time chat application and the cloud
deployment files I used for the final project demonstration. The application is
built as a React frontend with a Node.js/Express and Socket.IO backend. For the
final implementation, I kept the working application as one deployable service
and focused on demonstrating Docker and Kubernetes deployment concepts clearly.

The project demonstrates containerisation, Kubernetes configuration management,
secret handling, persistent MongoDB storage, Redis support for Socket.IO scaling,
health checks, resource limits, HPA scaling, and a simple GitHub Actions CI
workflow.

## Project Structure

- `frontend/` contains the React web client built with Vite.
- `backend/` contains the Express API and Socket.IO real-time messaging server.
- `Dockerfile` builds the frontend and backend into one production image.
- `docker-compose.yml` runs the app locally with MongoDB and Redis.
- `k8s/` contains the Kubernetes manifests used for the deployment demo.
- `.github/workflows/ci.yml` contains the GitHub Actions CI workflow.

## Application Overview

The application provides a real-time chat system with user registration, login,
one-to-one conversations, message persistence, and live Socket.IO messaging.
MongoDB stores users, chats, and messages. Redis is configured as the Socket.IO
adapter so messages can be shared correctly when the chat app runs with multiple
replicas.

Authentication uses password-based login with signed JWTs. Passwords are stored
as PBKDF2 hashes. The chat REST APIs require a bearer token, and Socket.IO
connections must provide a valid token during connection setup.

## Configuration

The application is configured through environment variables. The example values
are shown in `.env.example`:

```powershell
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb://localhost:27017/chat-app
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-a-long-random-secret
```

For Kubernetes, I separated configuration into:

- `k8s/chat-configmap.yaml` for non-sensitive values
- `k8s/chat-secret.yaml` for sensitive values such as `MONGO_URI` and
  `JWT_SECRET`

Real database credentials and real secrets are not included in this repository.

## Local Build

Install frontend and backend dependencies:

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

Start the backend after setting the required environment variables:

```powershell
cd ..\backend
npm start
```

The application runs at:

```text
http://localhost:3000
```

## Docker Compose

I used Docker Compose to test the application as a local containerised stack.
This starts three containers:

- chat app
- MongoDB
- Redis

Run:

```powershell
docker compose up --build
```

Useful URLs:

```text
http://localhost:3000
http://localhost:3000/healthz
```

The `/healthz` endpoint returns:

```json
{"ok":true}
```

## Kubernetes Deployment

The Kubernetes deployment includes:

- Namespace: `chat-app`
- ConfigMap for app configuration
- Secret for sensitive values
- Chat app Deployment with 2 replicas
- ClusterIP Service for the chat app
- Ingress manifest with WebSocket-friendly annotations
- MongoDB Deployment with a PersistentVolumeClaim
- Redis Deployment and Service
- CPU-based HorizontalPodAutoscaler
- readiness and liveness probes
- resource requests and limits
- optional NetworkPolicy

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

I applied the NetworkPolicy only after confirming that the application was
working, because strict network policies can block local demo access if the
cluster networking is different:

```powershell
kubectl apply -f k8s/chat-network-policy.yaml
```

Commands used to capture Kubernetes evidence:

```powershell
kubectl get all -n chat-app
kubectl get pods -n chat-app
kubectl get pvc -n chat-app
kubectl get configmap -n chat-app
kubectl get secret -n chat-app
kubectl get hpa -n chat-app
kubectl describe deployment chat-app -n chat-app
kubectl describe deployment mongo -n chat-app
kubectl describe deployment redis -n chat-app
```

For local browser access through Kubernetes, I used port forwarding:

```powershell
kubectl port-forward pod/<ready-chat-pod-name> 3000:3000 -n chat-app
```

Then I opened:

```text
http://localhost:3000
http://localhost:3000/healthz
```

## Rolling Updates

The chat Deployment uses a rolling update strategy:

- `maxUnavailable: 1`
- `maxSurge: 1`

Example rollout command:

```powershell
kubectl set image deployment/chat-app chat-container=chat-app:new-tag -n chat-app
kubectl rollout status deployment/chat-app -n chat-app
```

## Scaling

The HPA scales the chat app between 2 and 10 replicas using CPU utilisation:

```powershell
kubectl get hpa -n chat-app
kubectl describe hpa chat-hpa -n chat-app
```

My 4.2HD plan originally discussed custom WebSocket metrics. In this final
implementation I used CPU-based HPA because it is stable, demonstrable, and more
realistic for the project timeframe.

## CI/CD

I added a GitHub Actions workflow in `.github/workflows/ci.yml`. The workflow
runs on pushes and pull requests to `main`.

The workflow:

- installs backend dependencies
- checks backend JavaScript syntax
- installs frontend dependencies
- builds the React frontend
- builds the Docker image

This provides basic cloud service lifecycle automation and confirms that the
application can be built successfully after changes.

## Alignment With My 4.2HD Plan

This implementation matches the main cloud deployment goals from my 4.2HD plan:

- real-time chat application deployed through Docker and Kubernetes
- MongoDB-backed persistence
- Redis support for multi-replica Socket.IO messaging
- Kubernetes Namespace, ConfigMap, Secret, Deployment, Service, and Ingress
- PersistentVolumeClaim for MongoDB
- CPU-based HPA
- readiness and liveness probes
- resource requests and limits
- JWT-protected REST APIs and Socket.IO connections
- GitHub Actions CI workflow

I made some practical simplifications to keep the application stable for the
final demonstration:

- Auth and chat are kept in one backend service instead of separate
  microservices.
- The frontend is built into the same production image and served by Express,
  instead of running as a separate Nginx service.
- Prometheus/Grafana and custom WebSocket HPA metrics are left as future
  improvements.
- GKE deployment is documented as a future improvement; my working evidence is
  based on local Docker Desktop Kubernetes.
- Group channels and file upload are not included in this final version because
  the focus is on cloud architecture and deployment evidence.

These choices allowed me to keep the application working while still
demonstrating the main Kubernetes and cloud automation concepts required for the
project.
