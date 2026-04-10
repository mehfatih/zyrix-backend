# ─────────────────────────────────────────────────────────────
# Zyrix Backend — Production Dockerfile for Railway
# ─────────────────────────────────────────────────────────────

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install OpenSSL (required by Prisma)
RUN apk add --no-cache openssl

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy source code and prisma schema
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

# Install OpenSSL (required by Prisma at runtime)
RUN apk add --no-cache openssl

# Copy package files
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port (Railway sets PORT automatically)
EXPOSE ${PORT:-3000}

# Start server
CMD ["node", "dist/index.js"]
