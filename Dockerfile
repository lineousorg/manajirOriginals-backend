# =========================
# Stage 1: Build
# =========================
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy all source files
COPY . .

# Pass build-time argument
ARG NODE_ENV
ENV ENVIRONMENT=$NODE_ENV

# Debug: show which env will be used
RUN echo "========================"
RUN echo "ENVIRONMENT=$ENVIRONMENT"

# Copy appropriate env file to .env.local
RUN if [ "$ENVIRONMENT" = "production" ]; then \
      echo "Using production env"; \
      cp .env.production .env; \
    else \
      echo "Using development env"; \
      cp .env.development .env; \
    fi

# Debug: check .env contents
RUN echo "Contents of .env:"
RUN cat .env || echo "File missing!"

# Build Next.js (always a production build)
RUN echo "Starting Next.js build..."
RUN npm run build

# =========================
# Stage 2: Runner
# =========================
FROM node:20-alpine AS runner

WORKDIR /app

# Copy built files from builder
COPY --from=builder /app/package*.json ./ 
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Expose port
EXPOSE 3000

# Start the app
CMD ["node", "dist/main.js"]
