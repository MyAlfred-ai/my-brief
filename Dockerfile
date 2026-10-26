FROM node:22.23.4-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci --silent || npm install --silent
COPY . .
# Défauts VIDES : VITE_API_BASE_URL vide => URLs API relatives (web, et app
# native en mode server.url). Une origine absolue ne servirait qu'à un bundle
# embarqué (cf. src/config/apiBase.js).
ARG VITE_API_BASE_URL=
ARG VITE_AUTH_BASE_URL=
ARG VITE_AUTH_SIGNIN_URL=
ARG VITE_AUTH_LOGOUT_URL=
ARG VITE_AUTH_RETURN_URL=
ARG VITE_AUTH_LOGOUT_RETURN_URL=
ARG VITE_ADMIN_PASSWORD
RUN printf 'VITE_API_BASE_URL=%s\nVITE_AUTH_BASE_URL=%s\nVITE_AUTH_SIGNIN_URL=%s\nVITE_AUTH_LOGOUT_URL=%s\nVITE_AUTH_RETURN_URL=%s\nVITE_AUTH_LOGOUT_RETURN_URL=%s\nVITE_ADMIN_PASSWORD=%s\n' \
    "$VITE_API_BASE_URL" "$VITE_AUTH_BASE_URL" "$VITE_AUTH_SIGNIN_URL" \
    "$VITE_AUTH_LOGOUT_URL" "$VITE_AUTH_RETURN_URL" "$VITE_AUTH_LOGOUT_RETURN_URL" \
    "$VITE_ADMIN_PASSWORD" \
    > .env.production.local
RUN npm run build

FROM nginx:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html
# Cache-Control explicite (revalidation HTML/SW, immutable sur /assets) :
# évite que le navigateur serve une version périmée après déploiement.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist .
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -q -O /dev/null http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]

