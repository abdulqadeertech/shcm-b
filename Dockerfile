# Stage 1: Build TypeScript and Generate Prisma Client
FROM node:22-alpine AS builder

WORKDIR /app

# Install openssl for Prisma engine compatibility on Alpine
RUN apk add --no-cache openssl

# Install all dependencies (including devDependencies required for Prisma CLI & TypeScript)
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

RUN npm ci

# Copy application source code
COPY src ./src

# Generate Prisma Client and build TypeScript source
RUN npx prisma generate
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="file:./dev.db"

# Install openssl for Prisma engine runtime on Alpine
RUN apk add --no-cache openssl

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled JavaScript output and prisma files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Copy generated Prisma Client (.prisma) and Prisma runtime package (@prisma)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 5000

CMD ["node", "dist/index.js"]
