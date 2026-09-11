# HIDRO SELF-SERVICE — build multi-stage del monorepo.
# Ningún secreto va en la imagen: TODO se inyecta por variables de entorno.
FROM node:22-alpine AS build
WORKDIR /app
# package-lock.json garantiza builds reproducibles
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/state-machine/package.json packages/state-machine/package.json
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
# Podar devDependencies (typescript, vitest, drizzle-kit, supertest…) ANTES de
# copiar a runtime: el árbol que viaja pesa ~120 MB en vez de ~500 MB.
RUN npm prune --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
# node_modules ya podado (solo deps de producción). OJO monorepo: node_modules/@hidro/*
# NO son copias sino SYMLINKS a packages/* (npm workspaces); el tree viaja con los
# links intactos y los packages reales se copian abajo para que resuelvan (sin
# ellos el runtime muere con ERR_MODULE_NOT_FOUND).
COPY --from=build /app/node_modules ./node_modules
# Artefactos compilados + packages de workspaces (resuelven vía los symlinks)
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
# apps/web/dist: apps/api lo sirve como estático (single-domain, ver
# docs/designs/deploy-web-estatico.md) — dev-only/dev-autologin.html NUNCA está acá porque
# vive fuera de apps/web/public/, la única carpeta que Vite copia a dist/.
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/state-machine/package.json ./packages/state-machine/package.json
COPY --from=build /app/packages/state-machine/dist ./packages/state-machine/dist
# El proceso corre como node y necesita escribir su dataDir (./.data por defecto:
# PGlite embebido cuando no hay DATABASE_URL). Sin esto, el arranque muere EACCES.
RUN mkdir -p /app/.data && chown -R node:node /app
# usuario no-root
USER node
EXPOSE 3020
CMD ["node", "apps/api/dist/index.js"]
