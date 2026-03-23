# ── Stage 1: Build ────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# VITE_ env vars must be present at build time to be baked into the bundle
ARG VITE_ENTRA_CLIENT_ID
ARG VITE_ENTRA_AUTHORITY=https://login.microsoftonline.com/common
ARG VITE_ENTRA_REDIRECT_URI=http://localhost:80

ENV VITE_ENTRA_CLIENT_ID=$VITE_ENTRA_CLIENT_ID
ENV VITE_ENTRA_AUTHORITY=$VITE_ENTRA_AUTHORITY
ENV VITE_ENTRA_REDIRECT_URI=$VITE_ENTRA_REDIRECT_URI

RUN npm run build

# ── Stage 2: Serve with nginx ────────────────────────────────
FROM nginx:alpine

# Remove default nginx site
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /build/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
